import { FileSystemAdapter,Notice,TFile,TFolder,type TAbstractFile,type App } from 'obsidian';
import { randomUUID } from 'node:crypto';
import { join,resolve } from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
import { binding,detachCopiedBinding,markers,region } from './note';
import { fileName,parentPath,pathFor,validateName } from './naming';
import type { BridgeEvent,PluginData,Profile,RecordData } from './types';
import { Session } from './session';
import { NoteWriter } from './writer';
import { ObsidianNotes } from './access';
import { findPython,type PythonCommand } from './runtime';
import {ProjectionProof} from './proof';
import {defaultShell} from './settings';
import {SYSTEM_PROFILE_ID} from './types';
export class Manager {
  readonly sessions=new Map<string,Session>();
  readonly listeners=new Set<(session?:Session,event?:BridgeEvent)=>void>();
  readonly notes:ObsidianNotes;
  readonly base:string; readonly bridge:string;
  private operation:Promise<unknown>=Promise.resolve();
  private persistence:Promise<void>=Promise.resolve();
  private saveTimer?:ReturnType<typeof setTimeout>;
  private interval?:ReturnType<typeof setInterval>;
  private pythonPromise?:Promise<PythonCommand>;
  closed=false;
  constructor(readonly app:App,readonly data:PluginData,pluginDir:string,private saveData:()=>Promise<void>) {
    if(!(app.vault.adapter instanceof FileSystemAdapter)) throw new Error('终端需要本地文件夹知识库');
    this.base=app.vault.adapter.getBasePath();this.bridge='';this.notes=new ObsidianNotes(app);
  }
  private serial<T>(operation:()=>Promise<T>):Promise<T> {
    const next=this.operation.then(()=>{if(this.closed)throw new Error('插件正在关闭');return operation();});
    this.operation=next.catch(()=>{});return next;
  }
  persist():Promise<void> {
    this.persistence=this.persistence.catch(()=>{}).then(this.saveData);
    return this.persistence;
  }
  changed=(session?:Session,event?:BridgeEvent):void=>{
    for(const listener of this.listeners) listener(session,event);
    if(!this.saveTimer && !this.closed) this.saveTimer=setTimeout(()=>{
      this.saveTimer=undefined;void this.persist().catch(error=>new Notice('会话索引保存失败：'+error.message));
    },500);
  };
  python=():Promise<PythonCommand>=>{
    return this.pythonPromise??=(findPython(this.data.settings.python,this.bridge).catch(error=>{this.pythonPromise=undefined;throw error;}));
  };
  resetPython():void {this.pythonPromise=undefined;}
  private make(record:RecordData):Session {
    const writer=new NoteWriter(this.notes,record.id,record.path,record.lastHash,new ProjectionProof(join(this.base,'.agent-note-terminal',record.id+'.projection.json')));
    const session=new Session(record,join(this.base,'.agent-note-terminal',record.id+'.jsonl'),writer,{bridge:this.bridge,python:this.python,changed:this.changed,persist:()=>this.persist()});
    this.sessions.set(record.id,session);return session;
  }
  async load():Promise<void> {
    await mkdir(join(this.base,'.agent-note-terminal'),{recursive:true,mode:0o700});
    const ids=new Set<string>();
    for(const record of this.data.records) {
      if(!/^[0-9a-f-]{36}$/.test(record.id) || ids.has(record.id)) continue;
      ids.add(record.id);
      const session=this.make(record);
      if(!(this.app.vault.getAbstractFileByPath(record.path) instanceof TFile)) {record.state='missing';record.visible=false;continue;}
      try {
        if(binding(await this.notes.read(record.path))!==record.id) {
          record.state='missing';record.visible=false;session.error='原绑定文件已不存在或标识变化；旧日志保留，不写入同路径新文件';continue;
        }
        await session.restore();await session.writer.init();await session.flush();
      }
      catch(error) {record.state='failed';session.saveError=(error as Error).message;}
    }
    this.interval=setInterval(()=>{for(const session of this.sessions.values()) if(!session.saveError)void session.flush();},500);
    this.changed();
  }
  async attach(file:TFile):Promise<Session> {return this.serial(()=>this.attachInternal(file));}
  private async attachInternal(file:TFile,sourcePath?:string):Promise<Session> {
    if(file.extension!=='md') throw new Error('请选择 Markdown 笔记');
    const existing=[...this.sessions.values()].find(s=>s.record.path===file.path && s.record.state!=='missing');
    if(existing) {existing.record.visible=true;this.changed();return existing;}
    let content=await this.notes.read(file.path);
    const oldId=binding(content);
    let id=randomUUID();
    if(oldId) {
      const owner=this.sessions.get(oldId);
      if(owner) await this.notes.update(file.path,text=>detachCopiedBinding(text,oldId));
      else id=oldId as `${string}-${string}-${string}-${string}-${string}`;
    }
    const profile=SYSTEM_PROFILE_ID;
    const record:RecordData={id,transcriptVersion:2,path:file.path,...(sourcePath?{sourcePath}:{}),profile,visible:true,created:new Date().toISOString(),state:'idle',cwd:'',executable:'',args:[]};
    const session=this.make(record);this.data.records.push(record);
    if(oldId===id) await session.restore();else await session.initialize();
    await session.flush();await this.persist();this.changed();return session;
  }
  openFromFile(file:TFile):Promise<Session> {return this.serial(async()=>{
    const owned=[...this.sessions.values()].find(s=>s.record.path===file.path&&s.record.state!=='missing');
    if(owned){this.show(owned);return owned;}
    const pending=[...this.sessions.values()].find(s=>s.record.sourcePath===file.path&&(s.live||s.record.state==='idle'||(s.seq===0&&s.record.state==='failed')));
    if(pending){this.show(pending);return pending;}
    return this.newNoteInternal(parentPath(file.path),file.path);
  });}
  newNote(folder:string,sourcePath?:string):Promise<Session> {return this.serial(()=>this.newNoteInternal(folder,sourcePath));}
  private async newNoteInternal(folder:string,sourcePath?:string):Promise<Session> {
    if(folder && !this.app.vault.getFolderByPath(folder)) throw new Error('目标文件夹不存在');
    let n=this.data.counters[folder]??0;
    let path:string;
    do {n++;path=pathFor(folder,fileName(n));} while(await this.app.vault.adapter.exists(path));
    this.data.counters[folder]=n;await this.persist();
    const source=sourcePath?this.app.vault.getAbstractFileByPath(sourcePath):null;
    const origin=source instanceof TFile?'\n来源：'+this.app.fileManager.generateMarkdownLink(source,path)+'\n':'';
    const file=await this.app.vault.create(path,`# ${fileName(n).slice(0,-3)}\n${origin}`);
    return this.attachInternal(file,sourcePath);
  }
  async launch(session:Session,profileId?:string):Promise<void> {
    if(this.closed)throw new Error('插件正在关闭');
    if(session.live) return;
    if(session.saveError) {new Notice('请先恢复笔记同步：'+session.saveError);return;}
    if(profileId&&session.record.launch&&profileId!==session.record.launch.id)throw new Error('更换 Agent 请创建新笔记，已有会话保留原配置');
    const current=this.data.settings.profiles.find(p=>p.id===(profileId??session.record.profile));
    const template=(!session.seq&&!session.record.native)?current??session.record.launch:session.record.launch??current;
    if(!template) throw new Error('请先添加启动配置');
    const profile:Profile={...template,args:[...template.args]};
    if(!profile.executable.trim()) {
      if(profile.adapter==='opencode')throw new Error('请在 OpenCode 配置中填写程序路径');
      const shell=defaultShell(process.platform,process.env);profile.executable=shell.executable;if(!profile.args.length)profile.args=shell.args;
    }
    const cwd=session.record.launch&&(session.seq>0||session.record.native)?(session.record.cwd||session.native.snapshot?.cwd||profile.cwd):profile.cwd.trim()?resolve(profile.cwd):join(this.base,parentPath(session.record.path));
    if(session.legacyFrozen&&(session.record.native||session.record.state==='failed'&&session.seq<=1)){
      const original=session.record.path,folder=parentPath(original),name=original.split('/').pop()!.replace(/\.md$/,'')+'（继续）';let path=pathFor(folder,name+'.md'),n=1;
      while(await this.app.vault.adapter.exists(path))path=pathFor(folder,name+' '+(++n)+'.md');
      await this.app.vault.create(path,await this.notes.read(original));session.record.path=path;session.record.sourcePath=original;session.writer.path=path;session.legacyFrozen=false;await this.persist();
    }
    await session.start(profile,cwd);await this.persist();this.changed();
  }
  async selectProfile(session:Session,profileId:string):Promise<Session> {
    if(!this.data.settings.profiles.some(p=>p.id===profileId))throw new Error('启动配置已删除，请选择其他配置');
    if(session.record.profile===profileId)return session;
    if(!session.record.launch&&session.seq===0&&!session.live) {session.record.profile=profileId;await this.persist();this.changed();return session;}
    const next=await this.newNote(parentPath(session.record.path));next.record.profile=profileId;
    await this.persist();await this.launch(next);return next;
  }
  async rename(session:Session,name:string):Promise<void> {
    await this.serial(async()=>{
      const file=this.app.vault.getAbstractFileByPath(session.record.path);
      if(!(file instanceof TFile)) throw new Error('文件不存在');
      const path=pathFor(parentPath(file.path),validateName(name));
      if(path===file.path)return;
      if(await this.app.vault.adapter.exists(path))throw new Error('该名称已存在');
      await this.app.fileManager.renameFile(file,path);await this.persist();this.changed();
    });
  }
  async renamed(file:TAbstractFile,oldPath:string):Promise<void> {
    const moved=(path:string):string=>path===oldPath?file.path:file instanceof TFolder&&path.startsWith(oldPath+'/')?file.path+path.slice(oldPath.length):path;
    if(file instanceof TFolder)for(const [folder,count]of Object.entries(this.data.counters)) {
      const next=moved(folder);
      if(next!==folder){this.data.counters[next]=Math.max(this.data.counters[next]??0,count);delete this.data.counters[folder];}
    }
    for(const session of this.sessions.values()) {
      if(session.record.sourcePath)session.record.sourcePath=moved(session.record.sourcePath);
      if(session.record.state==='missing')continue;
      const next=moved(session.record.path);
      if(next!==session.record.path&&this.app.vault.getAbstractFileByPath(next) instanceof TFile){session.record.path=next;session.writer.path=next;}
    }
    this.changed();await this.persist();
  }
  compactCopy(session:Session):Promise<TFile>{return this.serial(async()=>{
    const source=this.app.vault.getFileByPath(session.record.path);if(!source)throw new Error('原笔记不存在');
    const body=await session.compactContent(),folder=parentPath(source.path),name=source.basename.slice(0,180)+'（精简记录）';let path=pathFor(folder,name+'.md'),n=1;
    while(await this.app.vault.adapter.exists(path))path=pathFor(folder,name+' '+(++n)+'.md');
    return this.app.vault.create(path,'# '+name+'\n\n来源：'+this.app.fileManager.generateMarkdownLink(source,path)+'\n\n> 依据已落盘日志生成；原笔记与原始日志保留。旧版无提交事件时仅标为终端输出，不猜测输入角色。\n\n'+body);
  });}
  async exportContent(session:Session):Promise<string> {
    await session.drain();await session.flush();
    if(session.historyError||session.saveError||session.record.journalError)throw new Error('请先恢复记录同步再导出：'+(session.historyError||session.saveError||session.record.journalError));
    return this.notes.read(session.record.path);
  }
  async deleted(path:string):Promise<void> {
    for(const session of this.sessions.values()) {
      const source=session.record.sourcePath;
      if(source&&(source===path||source.startsWith(path+'/')))delete session.record.sourcePath;
    }
    const victims=[...this.sessions.values()].filter(s=>s.record.state!=='missing' && (s.record.path===path || s.record.path.startsWith(path+'/')));
    for(const session of victims) {
      session.record.state='missing';session.record.visible=false;session.error='绑定笔记已删除，日志保留';await session.stop();session.record.state='missing';
    }
    this.changed();await this.persist();
  }
  async repair(session:Session):Promise<void> {
    if(session.historyError)throw new Error(session.historyError);
    await session.drain();
    const content=await this.notes.read(session.record.path);
    // Make an ordinary readable backup before replacing a user-edited region.
    const backup=join(this.base,'.agent-note-terminal',`${session.record.id}-backup-${Date.now()}.md`);
    await writeFile(backup,content,{encoding:'utf8',mode:0o600});
    const m=markers(session.record.id);
    await this.notes.update(session.record.path,text=>{
      let old;
      try {old=region(text,session.record.id);} catch {throw new Error('记录边界损坏：请恢复完整的开始/结束标记后再重试，已备份原笔记');}
      return old?text.slice(0,old.from)+text.slice(old.to):text;
    });
    session.writer.reset();session.saveError='';session.revision++;await session.flush();await this.persist();this.changed();
  }
  hide(session:Session):void {session.record.visible=false;this.changed();}
  show(session:Session):void {session.record.visible=true;this.changed();}
  reorder(id:string,before:string):void {
    const records=this.data.records;
    const from=records.findIndex(r=>r.id===id),to=records.findIndex(r=>r.id===before);
    if(from<0||to<0||from===to)return;
    const [item]=records.splice(from,1);records.splice(records.findIndex(r=>r.id===before),0,item);this.changed();
  }
  async shutdown():Promise<void> {
    this.closed=true;if(this.interval)clearInterval(this.interval);if(this.saveTimer)clearTimeout(this.saveTimer);
    await this.operation;
    await Promise.allSettled([...this.sessions.values()].map(s=>s.stop()));
    await this.persist();for(const session of this.sessions.values())session.dispose();
  }
}

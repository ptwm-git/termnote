import { FileSystemAdapter,Notice,TFile,TFolder,type TAbstractFile,type App } from 'obsidian';
import { randomUUID } from 'node:crypto';
import { join,resolve } from 'node:path';
import { mkdir,unlink } from 'node:fs/promises';
import { binding,detachCopiedBinding,region } from './note';
import { fileName,firstAvailableName,parentPath,pathFor,validateName } from './naming';
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
  readonly beforeClose=new Set<(id:string)=>Promise<void>>();
  readonly notes:ObsidianNotes;
  readonly base:string; readonly bridge:string;
  private operation:Promise<unknown>=Promise.resolve();
  private persistence:Promise<void>=Promise.resolve();
  private saveTimer?:ReturnType<typeof setTimeout>;
  private interval?:ReturnType<typeof setInterval>;
  private pythonPromise?:Promise<PythonCommand>;
  private closingRecords=new Set<string>();
  private movedDuringLoad=new Set<string>();private loadVisibility=new Map<string,boolean>();
  closed=false;loaded=false;ready:Promise<void>=Promise.resolve();
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
  private async restoreRecord(record:RecordData,removed:Set<string>):Promise<void>{
      const path=record.path,source=record.sourcePath,stale=()=>record.path!==path||record.sourcePath!==source;
      if(source&&source!==path){
        try{if(await this.app.vault.adapter.exists(source)){if(stale())return;if(binding(await this.notes.read(source))===record.id)record.sharedArchive=true;}}
        catch{record.sharedArchive=true;}
      }
      if(stale())return;
      if(record.discarded){
        const file=this.app.vault.getFileByPath(path);
        let same=false;
        try{const exists=file||await this.app.vault.adapter.exists(path);if(stale())return;if(!file&&exists)throw new Error('文件尚未载入，无法核验');same=!!file&&binding(await this.notes.read(path))===record.id;}
        catch(error){if(stale())return;const session=this.make(record);record.state='failed';record.visible=true;session.historyError=session.saveError='上次丢弃状态无法核验，已保留全部文件：'+(error as Error).message;return;}
        if(stale())return;
        if(!same){
          const pending=await this.cleanupRecord(record);if(!pending.length)removed.add(record.id);else new Notice('上次丢弃的日志仍待清理：'+pending.join('、'));return;
        }
        record.discarded=undefined;record.visible=true;new Notice('上次删除未完成，已保留备份：'+record.path);
      }
      const session=this.make(record);
      if(!(this.app.vault.getAbstractFileByPath(record.path) instanceof TFile)) {record.state='missing';record.visible=false;return;}
      let restored=false;
      try {
        if(binding(await this.notes.read(record.path))!==record.id) {
          if(stale()){session.historyError='路径变更中，等待重新核验';return;}
          record.state='missing';record.visible=false;session.error='原绑定文件已不存在或标识变化；旧日志保留，不写入同路径新文件';return;
        }
        if(stale()){session.historyError='路径变更中，等待重新核验';return;}
        if(record.state==='missing')record.state='idle';
        await session.restore();if(stale()){session.historyError='路径变更中，等待重新核验';return;}restored=true;await session.writer.init();await session.flush();
      }
      catch(error) {session.saveError=(error as Error).message;if(!restored){record.state='failed';session.historyError=session.saveError;}}
  }
  async load():Promise<void> {
    await mkdir(join(this.base,'.agent-note-terminal'),{recursive:true,mode:0o700});
    const ids=new Set<string>(),removed=new Set<string>();this.movedDuringLoad.clear();
    this.loadVisibility=new Map(this.data.records.map(record=>[record.id,record.visible||!!record.discarded]));
    for(const record of this.data.records) {
      if(!/^[0-9a-f-]{36}$/.test(record.id)||ids.has(record.id))continue;
      ids.add(record.id);await this.restoreRecord(record,removed);
    }
    // Rename events can arrive while an asynchronous journal is being restored.
    // Rebuild only those projections after their verified path has settled.
    while(this.movedDuringLoad.size){
      const moved=[...this.movedDuringLoad];this.movedDuringLoad.clear();
      for(const id of moved){
        if(!ids.has(id)||removed.has(id))continue;
        const record=this.data.records.find(item=>item.id===id)!;
        this.sessions.get(id)?.dispose();this.sessions.delete(id);
        record.visible=this.loadVisibility.get(id)??record.visible;
        await this.restoreRecord(record,removed);
      }
    }
    this.data.records=this.data.records.filter(record=>!removed.has(record.id));
    this.interval=setInterval(()=>{for(const session of this.sessions.values()) if(!session.saveError)void session.flush();},500);
    this.loaded=true;this.changed();
  }
  async attach(file:TFile):Promise<Session> {return this.serial(()=>this.attachInternal(file));}
  private async attachInternal(file:TFile,sourcePath?:string,generated=false):Promise<Session> {
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
    const record:RecordData={id,transcriptVersion:2,recordingVersion:1,path:file.path,...(sourcePath?{sourcePath}:{}),...(generated?{generated:true as const}:{}),profile,visible:true,created:new Date().toISOString(),state:'idle',cwd:'',executable:'',args:[]};
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
    const {number:n,path}=await firstAvailableName(folder,path=>this.app.vault.adapter.exists(path));
    this.data.counters[folder]=Math.max(this.data.counters[folder]??0,n);await this.persist();
    const source=sourcePath?this.app.vault.getAbstractFileByPath(sourcePath):null;
    const origin=source instanceof TFile?'\n来源：'+this.app.fileManager.generateMarkdownLink(source,path)+'\n':'';
    const file=await this.app.vault.create(path,`# ${fileName(n).slice(0,-3)}\n${origin}`);
    return this.attachInternal(file,sourcePath,true);
  }
  async launch(session:Session,profileId?:string):Promise<void> {
    if(this.closed)throw new Error('插件正在关闭');
    if(this.isClosing(session))throw new Error('会话正在关闭，请等待完成');
    return this.serial(()=>this.launchInternal(session,profileId));
  }
  private async launchInternal(session:Session,profileId?:string):Promise<void>{
    if(this.sessions.get(session.record.id)!==session)throw new Error('此会话已关闭');
    if(this.isClosing(session))throw new Error('会话正在关闭，请等待完成');
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
      await this.app.vault.create(path,await this.notes.read(original));session.record.path=path;session.record.sourcePath=original;session.record.generated=true;session.record.sharedArchive=true;session.writer.path=path;session.legacyFrozen=false;await this.persist();
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
    if(this.closed)return;
    const moved=(path:string):string=>path===oldPath?file.path:file instanceof TFolder&&path.startsWith(oldPath+'/')?file.path+path.slice(oldPath.length):path;
    if(file instanceof TFolder)for(const [folder,count]of Object.entries(this.data.counters)) {
      const next=moved(folder);
      if(next!==folder){this.data.counters[next]=Math.max(this.data.counters[next]??0,count);delete this.data.counters[folder];}
    }
    if(!this.loaded){
      for(const record of this.data.records){
        if(record.sourcePath){const nextSource=moved(record.sourcePath);if(nextSource!==record.sourcePath){record.sourcePath=nextSource;this.movedDuringLoad.add(record.id);}}
        const next=moved(record.path);
        if(next!==record.path){record.path=next;const session=this.sessions.get(record.id);if(session)session.writer.path=next;this.movedDuringLoad.add(record.id);}
      }
      this.changed();await this.persist();return;
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
  async refreshNative(session:Session):Promise<void>{
    if(this.isClosing(session))throw new Error('会话正在关闭，请等待完成');
    return this.serial(async()=>{
      if(this.sessions.get(session.record.id)!==session)throw new Error('此会话已关闭');
      if(this.isClosing(session))throw new Error('会话正在关闭，请等待完成');
      await session.refreshNative();
    });
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
  async setRecording(session:Session,enabled:boolean):Promise<void>{
    if(this.isClosing(session))throw new Error('会话正在关闭');
    return this.serial(async()=>{
      if(this.sessions.get(session.record.id)!==session||this.isClosing(session))throw new Error('此会话已关闭');
      await session.setRecording(enabled);this.changed();
    });
  }
  async repair(session:Session):Promise<string> {return this.serial(async()=>{
    if(this.sessions.get(session.record.id)!==session||this.isClosing(session))throw new Error('此会话已关闭');
    session.assertCompleteHistory();
    await session.drain();const content=await this.notes.read(session.record.path);
    if(binding(content)!==session.record.id)throw new Error('文件会话绑定已变化，拒绝覆盖');
    if(!region(content,session.record.id))throw new Error('找不到完整会话区域，已保留原文，请检查开始和结束标记');
    const folder=parentPath(session.record.path),name=session.record.path.split('/').pop()!.replace(/\.md$/,'').slice(0,150)+'（同步恢复前备份 '+Date.now()+'）';
    let backup=pathFor(folder,name+'.md'),n=1;while(await this.app.vault.adapter.exists(backup))backup=pathFor(folder,name+' '+(++n)+'.md');
    await this.app.vault.create(backup,content);
    try{await session.recoverNote(content);await this.persist();this.changed();return backup;}
    catch(error){throw new Error((error as Error).message+'；原文备份：'+backup);}
  });}
  hide(session:Session):void {session.record.visible=false;this.changed();}
  isClosing(session:Session):boolean{return this.closingRecords.has(session.record.id);}
  canDiscard(session:Session):boolean{return session.record.generated===true||!!session.record.sourcePath&&session.record.sourcePath!==session.record.path;}
  private cleanupRecord(record:RecordData):Promise<string[]>{return record.sharedArchive?Promise.resolve([]):this.cleanupOwned(record.id);}
  private async cleanupOwned(id:string):Promise<string[]>{
    if(!/^[0-9a-f-]{36}$/u.test(id))throw new Error('会话标识无效，拒绝清理日志');
    const pending:string[]=[];
    for(const suffix of ['.jsonl','.projection.json','.opencode.json']){
      const name=id+suffix;try{await unlink(join(this.base,'.agent-note-terminal',name));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')pending.push(name);}
    }
    return pending;
  }
  closeSession(session:Session,save:boolean):Promise<string|undefined>{
    if(this.isClosing(session))return Promise.reject(new Error('会话正在关闭，请等待完成'));
    this.closingRecords.add(session.record.id);
    return this.serial(async()=>{
    const record=session.record,id=record.id;
    if(this.sessions.get(id)!==session)throw new Error('此会话已关闭');
    if(!save&&!this.canDiscard(session))throw new Error('此文件不是可确认的自动生成备份，请在文件列表中自行处理');
      await session.stop();
      if(save&&(session.saveError||session.historyError||record.journalError||session.nativeError))throw new Error('记录尚未完整保存：'+(session.saveError||session.historyError||record.journalError||session.nativeError));
      let file:TFile|null=null;
      if(!save){
        file=this.app.vault.getFileByPath(record.path);
        if(!file&&await this.app.vault.adapter.exists(record.path))throw new Error('文件尚未载入，无法核验归属；已保留文件');
        if(file&&binding(await this.notes.read(record.path))!==id)throw new Error('该路径已不是本会话的备份，已保留文件');
      }
      await Promise.all([...this.beforeClose].map(close=>close(id)));
      const visible=record.visible;
      if(save){
        record.visible=false;try{await this.persist();}catch(error){record.visible=visible;throw error;}this.changed();return;
      }
      record.discarded=true;record.visible=false;
      try{await this.persist();}catch(error){record.discarded=undefined;record.visible=visible;throw error;}
      try{
        if(file){
          if(this.app.vault.getFileByPath(record.path)!==file||binding(await this.notes.read(record.path))!==id)throw new Error('备份文件已变化，已取消删除');
          await this.app.fileManager.trashFile(file);
        }
      }catch(error){record.discarded=undefined;record.visible=visible;await this.persist().catch(()=>{});throw error;}
      record.state='missing';this.sessions.delete(id);session.dispose();this.changed();
      const pending=await this.cleanupRecord(record);
      if(!pending.length)this.data.records=this.data.records.filter(item=>item!==record);
      try{await this.persist();}catch{return '备份已移入回收站；索引同步失败，重载后会继续清理本会话残留';}
      return pending.length?'备份已移入回收站；部分日志仍待清理，重载后重试：'+pending.join('、'):record.sharedArchive?'继续副本已移入回收站；与历史原件共享的日志和原生归档已保留':undefined;
    }).finally(()=>{this.closingRecords.delete(session.record.id);this.changed();});
  }
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

import { spawn,type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream,existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { stat,open } from 'node:fs/promises';
import type { BridgeEvent,RecordData,Profile } from './types';
import { STATE_LABEL } from './types';
import { Transcript } from './transcript';
import {LegacyTranscript} from './legacy-transcript';
import {InputDraft} from './input';
import { NoteWriter } from './writer';
import {bridgeArgs,type PythonCommand} from './runtime';
import {NativeArchive} from './native';
import {OpenCodeServer} from './opencode';
import {region,hash} from './note';
import {checkedEvent} from './event';
export interface SessionHost {
  python():Promise<PythonCommand>; bridge:string;
  changed(session:Session,event?:BridgeEvent):void;
  persist?():Promise<void>;
}
export class Session {
  readonly transcript:Transcript|LegacyTranscript;
  private input=new InputDraft();private writes:Promise<void>=Promise.resolve();
  child?:ChildProcessWithoutNullStreams;
  error=''; saveError=''; savedAt=''; seq=0; revision=0; savedRevision=-1;
  private events:Promise<void>=Promise.resolve();
  private saveQueue:Promise<void>=Promise.resolve();
  private exitPromise?:Promise<void>;
  private stopping=false;
  readonly native:NativeArchive;
  nativeError='';
  historyError='';private historyIncomplete=false;legacyFrozen=false;
  private nativeBlocked=false;
  private server?:OpenCodeServer;
  private nativeTimer?:ReturnType<typeof setInterval>;
  private nativeSync?:Promise<void>;
  private startingTask?:Promise<void>;
  private refreshing?:Promise<void>;
  private stopTask?:Promise<void>;
  private closing=false;
  constructor(readonly record:RecordData,readonly journal:string,readonly writer:NoteWriter,readonly host:SessionHost) {this.transcript=record.transcriptVersion===2?new Transcript():new LegacyTranscript();this.native=new NativeArchive(journal.replace(/\.jsonl$/,'.opencode.json'));}
  get live():boolean { return this.record.state==='running'||this.record.state==='starting'; }
  async initialize():Promise<void> {
    try {const file=await open(this.journal,'wx',0o600);try{await file.sync();}finally{await file.close();}}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  }
  private async ingest(event:BridgeEvent,replay=false):Promise<void> {
    if(event.seq>0)this.seq=event.seq; this.revision++;
    if(event.type==='output' && event.data!==undefined) await this.transcript.feed(event.data);
    if(event.type==='interaction'&&this.transcript instanceof Transcript)await this.transcript.interaction(event);
    if(event.type==='resize' && event.cols && event.rows) this.transcript.resize(event.cols,event.rows);
    if(event.type==='start') {
      if(event.cols && event.rows) this.transcript.resize(event.cols,event.rows);
      this.record.state=replay?'interrupted':'running';
      if(!replay)this.record.journalError=undefined;
    }
    if(event.type==='exit') this.record.state='ended';
    if(event.type==='error') {this.error=event.message||'终端连接失败';this.record.state='failed';}
    if(!replay) this.host.changed(this,event);
  }
  async restore():Promise<void> {
    try{await this.restoreInternal();}catch(error){this.historyError=(error as Error).message;throw error;}
  }
  private async restoreInternal():Promise<void> {
    try {
      await this.native.load(this.record.native);
      if(this.native.snapshot) {this.record.native=this.native.snapshot.binding;this.record.launch=this.native.snapshot.profile;this.record.cwd=this.native.snapshot.cwd;}
    }catch(error){this.nativeBlocked=true;throw error;}
    if(!existsSync(this.journal)) {
      const old=region(await this.writer.access.read(this.record.path),this.record.id),metadata=old?.text.split('\n\n')[1]??'';
      const knownEmpty=old&&this.record.lastHash===hash(old.text)&&!this.record.native&&metadata.startsWith('> [!info]- 会话信息')&&metadata.split('\n').includes('> - 已归档事件：0');
      // Narrow migration for authenticated, zero-event placeholders from 0.1.0.
      if(knownEmpty){await this.initialize();return;}
      if(this.record.state!=='idle'||old) {
        this.error='原始日志不存在；已保留笔记，不能重建历史。请找回日志或新建笔记';this.record.state='failed';throw new Error(this.error);
      }
      return;
    }
    const stream=createReadStream(this.journal,{encoding:'utf8'});
    const lines=createInterface({input:stream,crlfDelay:Infinity});
    let truncated=false;
    try {
      for await(const line of lines) {
        if(!line.trim()) continue;
        if(truncated) throw new Error('日志中部损坏，已保留原文件并停止自动恢复');
        let event:BridgeEvent;
        let parsed:unknown;try {parsed=JSON.parse(line);} catch {truncated=true;continue;}event=checkedEvent(parsed);
        if(!Number.isInteger(event.seq) || event.seq!==this.seq+1) throw new Error('日志事件序号不连续，已保留笔记并停止自动重建');
        await this.ingest(event,true);
      }
      const saved=region(await this.writer.access.read(this.record.path),this.record.id),metadata=saved?.text.split('\n\n')[1]??'';
      const savedSequence=/^> - 已归档事件：(\d+)$/m.exec(metadata);
      if(savedSequence&&Number(savedSequence[1])>this.seq)throw new Error('原始日志短于笔记中已保存的记录；已保留笔记，不能用残缺日志重建');
      if(truncated) {this.historyIncomplete=true;this.error='已恢复完整日志；末尾存在中断时未写完整的数据';}
      if(this.record.transcriptVersion!==2&&this.seq>0&&saved){await this.writer.init();this.legacyFrozen=true;this.savedRevision=this.revision;}
    } finally { lines.close();stream.destroy(); }
  }
  async start(profile:Profile,cwd:string):Promise<void> {
    if(this.refreshing||this.stopTask||this.closing||this.child&&!this.live)throw new Error('会话正在同步或收尾，请稍后继续');
    if(this.live) return;
    if(this.historyError)throw new Error(this.historyError);
    if(this.nativeBlocked)throw new Error('原生归档校验失败，请保留原文件并检查归档，不能覆盖旧记录');
    const enhanced=profile.adapter==='opencode';
    if(!enhanced && this.seq>0 && !['idle','failed'].includes(this.record.state)) throw new Error('该会话已经结束，请新建终端页面开始另一场对话');
    if(!enhanced && this.record.state==='failed' && existsSync(this.journal) && this.seq>1) throw new Error('请保留已有记录并新建页面；失败会话已有历史输出');
    this.stopping=false;
    this.record.state='starting';this.error='';this.revision++;this.host.changed(this);
    this.startingTask=this.startInternal(profile,cwd);
    try{await this.startingTask;}finally{this.startingTask=undefined;}
  }
  private async startInternal(profile:Profile,cwd:string):Promise<void> {
    try {
      await this.initialize();
      if(!(await stat(cwd)).isDirectory()) throw new Error('工作目录不是文件夹');
      const python=await this.host.python();
      if(!this.seq&&!this.record.native)this.record.launch=structuredClone(profile);
      else this.record.launch??=structuredClone(profile);
      this.record.cwd=cwd;
      let executable=profile.executable,args=[...profile.args],env:Record<string,string>={};
      if(profile.adapter==='opencode') {
        const server=new OpenCodeServer();this.server=server;
        await server.start(this.host,profile,cwd);
        if(this.stopping)throw new Error('启动已取消');
        const binding=await server.bind(profile,this.record.native);
        await this.native.merge(binding,profile,cwd,await server.export(binding));
        this.record.native=binding;this.nativeError='';
        await this.host.persist?.();
        executable=server.executable;args=server.terminalArgs(binding,profile);env=server.environment;
      }
      if(this.stopping)throw new Error('启动已取消');
      this.record.cwd=cwd; this.record.executable=executable;this.record.args=args;this.record.profile=profile.id;
      const child=spawn(python.executable,[...python.prefix,...bridgeArgs(this.host.bridge)],{stdio:'pipe',windowsHide:true,env:{...process.env,...env,PYTHONIOENCODING:'utf-8'}});
      this.child=child;
      let stderr='';
      child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4000);});
      const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
      lines.on('line',line=>{
        child.stdout.pause();
        this.events=this.events.then(async()=>{
          const event=checkedEvent(JSON.parse(line));
          await this.ingest(event);
          if(event.seq<0) {this.record.journalError=event.message||'日志写入失败';void this.stop();}
        }).catch(error=>{this.error=(error as Error).message;this.record.state='failed';this.host.changed(this);void this.stop();})
          .finally(()=>child.stdout.resume());
      });
      this.exitPromise=new Promise(resolve=>{
        child.once('error',error=>{this.error=error.message;this.record.state='failed';});
        child.once('close',()=>{
          this.closing=true;
          lines.close();
          void this.events.then(async()=>{
            await this.finishNative();
            this.child=undefined;
            if(this.live) this.record.state=this.stopping?'ended':'interrupted';
            if(stderr && !this.error) this.error=stderr;
            this.revision++;await this.flush();this.host.changed(this);
          }).catch(error=>{this.error=(error as Error).message;this.host.changed(this);}).finally(()=>{this.closing=false;resolve();});
        });
      });
      child.stdin.on('error',error=>{if((error as NodeJS.ErrnoException).code==='EPIPE'&&(this.stopping||this.record.state==='ended'))return;this.error=error.message;this.host.changed(this);});
      child.stdin.write(JSON.stringify({executable,args,cwd,journal:this.journal,cols:this.transcript.terminal.cols,rows:this.transcript.terminal.rows})+'\n');
      if(this.server)this.nativeTimer=setInterval(()=>{void this.syncNative().catch(()=>{});},2000);
    } catch(error) {
      await this.finishNative();
      this.record.state=this.stopping?'ended':'failed';this.error=(error as Error).message;this.revision++;this.host.changed(this);await this.flush();
    }
  }
  private syncNative():Promise<void> {
    if(this.nativeSync)return this.nativeSync;
    const server=this.server,binding=this.record.native,profile=this.record.launch;
    if(!server||!binding||!profile)return Promise.resolve();
    this.nativeSync=(async()=>{
      try {
        const changed=await this.native.merge(binding,profile,this.record.cwd||this.native.snapshot?.cwd||'',await server.export(binding));
        if(changed||this.nativeError){this.nativeError='';this.revision++;this.host.changed(this);}
      }catch(error){this.nativeError=(error as Error).message;this.revision++;this.host.changed(this);throw error;}
    })().finally(()=>{this.nativeSync=undefined;});
    return this.nativeSync;
  }
  private async finishNative():Promise<void> {
    if(this.nativeTimer)clearInterval(this.nativeTimer);this.nativeTimer=undefined;
    const server=this.server;if(!server)return;
    try{await this.syncNative();}catch{/* retain previous durable archive and show nativeError */}
    await server.stop();if(this.server===server)this.server=undefined;
  }
  async refreshNative():Promise<void> {
    if(this.refreshing)return this.refreshing;
    if(this.stopTask||this.closing)throw new Error('会话正在收尾，请稍后补齐记录');
    if(this.nativeBlocked)throw new Error('原生归档校验失败，不能覆盖旧记录');
    if(!this.record.native||!this.record.launch)throw new Error('当前会话没有 OpenCode 原生绑定');
    if(this.record.state==='starting')throw new Error('请等待会话启动完成');
    this.refreshing=this.refreshInternal();
    try{await this.refreshing;}finally{this.refreshing=undefined;}
  }
  private async refreshInternal():Promise<void> {
    const temporary=!this.server,server=this.server??new OpenCodeServer();this.server=server;
    try {
      if(temporary) {await server.start(this.host,this.record.launch!,this.record.cwd||this.native.snapshot!.cwd);await server.bind(this.record.launch!,this.record.native);}
      await this.syncNative();await this.flush();
    }finally{if(temporary){await server.stop();if(this.server===server)this.server=undefined;}}
  }
  write(data:string):void {
    if(this.record.state!=='running')return;
    if(!(this.transcript instanceof Transcript)){this.send({type:'write',data});return;}
    this.writes=this.writes.then(()=>this.writeTracked(data)).catch(error=>{this.error='输入归档失败：'+(error as Error).message;this.host.changed(this);});
  }
  private async writeTracked(data:string):Promise<void>{
    const transcript=this.transcript;if(!(transcript instanceof Transcript)||this.record.state!=='running')return;
    let pending='',inputLines=this.input.lineCount;const flush=()=>{if(pending){this.send({type:'write',data:pending});pending='';}};
    for(const token of this.input.tokens(data)){
      const action=this.input.accept(token);
      const nextLines=this.input.lineCount;
      if(action==='edit'||nextLines!==inputLines){flush();this.send({type:'interaction',action:'edit',inputLines:nextLines});inputLines=nextLines;}
      if(action==='cancel'){flush();this.send({type:'interaction',action:'cancel'});}
      if(action==='submit'){
        flush();let visible={text:'',echo:''};
        // Let the terminal acknowledge the last typed/pasted characters before Enter.
        for(let tries=0;tries<12;tries++){
          await new Promise(resolve=>setTimeout(resolve,15));await this.events;
          visible=await transcript.visibleInput(this.input.text,this.input.unknown);
          if(visible.text||!this.input.text)break;
        }
        const operation=this.input.navigation&&transcript.fullScreen;
        this.send({type:'interaction',action:'submit',...(operation?{data:'确认选择',inputKind:'operation'}:visible.text?{data:visible.text,inputKind:'input',echo:visible.echo}:{echo:visible.echo})});
        this.input.reset();this.send({type:'write',data:token});
      }else pending+=token;
    }
    flush();
  }
  resize(cols:number,rows:number):void {
    if(cols===this.transcript.terminal.cols && rows===this.transcript.terminal.rows) return;
    if(this.live) this.send({type:'resize',cols,rows});
  }
  private send(event:object):void { if(this.child?.stdin.writable) this.child.stdin.write(JSON.stringify(event)+'\n'); }
  async compactContent():Promise<string>{
    await this.drain();await this.flush();
    if(this.historyIncomplete||this.historyError||this.saveError||this.record.journalError)throw new Error('请先恢复完整记录：'+(this.historyError||this.saveError||this.record.journalError||'日志末尾不完整'));
    if(this.native.snapshot)return this.native.render();
    const limit=this.seq,projection=new Transcript(),stream=createReadStream(this.journal,{encoding:'utf8'}),lines=createInterface({input:stream,crlfDelay:Infinity});let seq=0;
    try{
      for await(const line of lines){
        if(!line.trim())continue;if(seq===limit&&this.live)break;
        const event=checkedEvent(JSON.parse(line));if(event.seq!==seq+1)throw new Error('原始日志事件不连续，不能生成完整副本');seq=event.seq;
        if(event.type==='output'&&event.data!==undefined)await projection.feed(event.data);
        if(event.type==='interaction')await projection.interaction(event);
        if((event.type==='start'||event.type==='resize')&&event.cols&&event.rows)projection.resize(event.cols,event.rows);
      }
      if(seq!==limit)throw new Error('原始日志不完整，不能生成副本');return await projection.render();
    }finally{lines.close();stream.destroy();projection.dispose();}
  }
  async body():Promise<string> {
    return '## 终端会话记录\n\n'+
      `> [!info]- 会话信息 · ${STATE_LABEL[this.record.state]}\n> - 会话：\`${this.record.id}\`\n> - 创建：${this.record.created}\n> - 状态：${STATE_LABEL[this.record.state]}\n`+
      `> - 程序：${JSON.stringify([this.record.executable,...this.record.args])}\n> - 工作目录：${JSON.stringify(this.record.cwd)}\n`+
      `> - 原始日志：\`.agent-note-terminal/${this.record.id}.jsonl\`（插件“日志”按钮可定位）\n> - 已归档事件：${this.seq}\n\n`+
      (this.record.journalError?`> 原始日志故障，程序已停止：${this.record.journalError.replace(/\n/g,' ')}\n\n`:'')+
      (this.error?`> 终端提示：${this.error.replace(/\n/g,' ')}\n\n`:'')+
      (this.nativeError?`> 原生记录待同步：${this.nativeError.replace(/\n/g,' ')}\n\n`:'')+await this.content();
  }
  async content():Promise<string> {
    if(this.legacyFrozen){const saved=region(await this.writer.access.read(this.record.path),this.record.id);if(saved)return saved.text;}
    const terminal=await this.transcript.render();
    return this.native.snapshot?this.native.render()+'\n> [!abstract]- 终端显示记录（含界面重绘）\n'+terminal.split('\n').map(line=>'> '+line).join('\n')+'\n':terminal;
  }
  flush():Promise<void> {
    this.saveQueue=this.saveQueue.then(async()=>{
      await this.events;
      if(this.legacyFrozen||this.historyError||this.savedRevision===this.revision || this.record.state==='missing') return;
      const revision=this.revision;
      try {
        const body=await this.body();
        this.record.lastHash=await this.writer.save(body);
        this.savedRevision=revision;this.saveError='';this.savedAt=new Date().toLocaleTimeString();
      } catch(error) {this.saveError=(error as Error).message;}
      this.host.changed(this);
    });
    return this.saveQueue;
  }
  stop():Promise<void> {
    if(this.stopTask)return this.stopTask;
    this.stopping=true;
    this.stopTask=this.stopInternal().finally(()=>{this.stopTask=undefined;});return this.stopTask;
  }
  private async stopInternal():Promise<void> {
    if(this.refreshing)await this.refreshing.catch(()=>{});
    if(this.startingTask)await this.startingTask;
    await this.writes;
    if(this.child) {
      if(this.record.state!=='ended')this.send({type:'stop'});this.child.stdin.end();
      const child=this.child;
      const timer=setTimeout(()=>{if(this.child===child) child.kill();},6000);
      await this.exitPromise;
      clearTimeout(timer);
    } else {await this.finishNative();if(this.live) {this.record.state='ended';this.revision++;}}
    await this.flush();
  }
  async drain():Promise<void> { await this.writes;await this.events; }
  dispose():void {this.transcript.dispose();}
}

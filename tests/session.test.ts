import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Session} from '../src/session';
import {NoteWriter} from '../src/writer';
import type {RecordData} from '../src/types';
import {OpenCodeServer} from '../src/opencode';
import {patchNote} from '../src/note';
test('缺失或损坏原始日志时，自动保存及关闭不得覆盖唯一历史笔记',async()=>{
  for(const corrupt of ['missing','invalid','gap','prefix','empty']) {
    const dir=await mkdtemp(join(tmpdir(),'termnote-preserve-')),id=randomUUID(),journal=join(dir,'missing.jsonl');
    let text=patchNote('# 手工正文\n',id,'## 终端会话记录\n\n> [!info]- 会话信息\n> - 已归档事件：3\n\n唯一历史对话，必须保留',null);const before=text;
    if(corrupt==='invalid')await writeFile(journal,'{"type":"output","seq":1,"time":"now","data":"部分数据"}\n坏数据\n{}\n');
    if(corrupt==='gap')await writeFile(journal,'{"type":"start","seq":1,"time":"now"}\n{"type":"exit","seq":3,"time":"now"}\n');
    if(corrupt==='prefix')await writeFile(journal,'{"type":"start","seq":1,"time":"now"}\n');
    if(corrupt==='empty')await writeFile(journal,'');
    const record:RecordData={id,path:'A.md',visible:true,profile:'shell',created:'now',state:'ended',cwd:dir,executable:'/bin/sh',args:[]};
    const session=new Session(record,journal,new NoteWriter({read:async()=>text,update:async(_p,fn)=>{text=fn(text);}},id,'A.md'),{bridge:'',python:async()=>({executable:'',prefix:[],description:''}),changed:()=>{}});
    try{await assert.rejects(session.restore());await session.flush();await session.stop();assert.equal(text,before);assert.ok(session.historyError);}
    finally{session.dispose();await rm(dir,{recursive:true,force:true});}
  }
});
test('首次预检查失败后重载，可修正配置并重试；空笔记先建持久日志',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'termnote-retry-')),id=randomUUID(),journal=join(dir,'events.jsonl');let text='# 新会话\n';
  const access={read:async()=>text,update:async(_p:string,fn:(t:string)=>string)=>{text=fn(text);}};
  const record:RecordData={id,path:'A.md',visible:true,profile:'test',created:'now',state:'idle',cwd:'',executable:'',args:[]};
  const host={bridge:resolve('bridge.py'),python:async()=>({executable:process.platform==='win32'?'python':'python3',prefix:[],description:'test'}),changed:()=>{}};
  const profile={id:'test',name:'测试',executable:'missing',args:[],cwd:dir};
  const original=new Session(record,journal,new NoteWriter(access,id,'A.md'),host);
  let recovered:Session|undefined;
  try{
    await original.start(profile,join(dir,'missing-cwd'));assert.equal(record.state,'failed');assert.equal(await readFile(journal,'utf8'),'');
    recovered=new Session(structuredClone(record),journal,new NoteWriter(access,id,'A.md',record.lastHash),host);await recovered.restore();assert.equal(recovered.historyError,'');
    await recovered.start({...profile,executable:process.execPath,args:['-e','console.log("RETRY_OK")']},dir);
    const until=Date.now()+10000;while(recovered.live&&Date.now()<until)await new Promise(r=>setTimeout(r,20));await recovered.stop();assert.match(text,/RETRY_OK/);
  }finally{await recovered?.stop();original.dispose();recovered?.dispose();await rm(dir,{recursive:true,force:true});}
});
test('手动补齐、继续和结束互斥，不覆盖或遗留私有服务',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'termnote-lifecycle-'));let text='# 历史\n';
  const original={start:OpenCodeServer.prototype.start,bind:OpenCodeServer.prototype.bind,export:OpenCodeServer.prototype.export,stop:OpenCodeServer.prototype.stop};
  let ready!:()=>void;const gate=new Promise<void>(r=>ready=r);let starts=0,stops=0;
  const profile={id:'oc',name:'OpenCode',adapter:'opencode' as const,executable:'opencode',args:[],cwd:dir};
  const native={kind:'opencode' as const,api:'v2' as const,version:'2.0.26',sessionID:'ses_lifecycle'};
  OpenCodeServer.prototype.start=async()=>{starts++;await gate;};
  OpenCodeServer.prototype.bind=async()=>native;
  OpenCodeServer.prototype.export=async()=>({info:{id:native.sessionID},messages:[]});
  OpenCodeServer.prototype.stop=async()=>{stops++;};
  const record:RecordData={id:randomUUID(),path:'A.md',visible:true,profile:'oc',created:'now',state:'ended',cwd:dir,executable:'opencode',args:[],native,launch:profile};
  const session=new Session(record,join(dir,'log.jsonl'),new NoteWriter({read:async()=>text,update:async(_p,fn)=>{text=fn(text);}},record.id,'A.md'),{bridge:'',python:async()=>({executable:'',prefix:[],description:''}),changed:()=>{}});
  try{
    const syncing=session.refreshNative(),again=session.refreshNative();
    await assert.rejects(session.start(profile,dir),/同步或收尾/);
    let ended=false;const stopping=session.stop().then(()=>ended=true);
    await new Promise(r=>setTimeout(r,5));assert.equal(ended,false);
    ready();await Promise.all([syncing,again,stopping]);
    assert.equal(starts,1);assert.equal(stops,1);assert.match(text,/OpenCode 对话记录/);
  }finally{Object.assign(OpenCodeServer.prototype,original);session.dispose();await rm(dir,{recursive:true,force:true});}
});
test('真实 PTY 持续保存、结束收尾、重建笔记（无重复）', {skip:process.platform==='win32',timeout:20000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agent-terminal-'));
  let text='# 我的笔记\n';const access={read:async()=>text,update:async(_path:string,fn:(text:string)=>string)=>{text=fn(text);}};
  const record:RecordData={id:randomUUID(),path:'A.md',visible:true,profile:'shell',created:new Date().toISOString(),state:'idle',cwd:'',executable:'',args:[]};
  const host={bridge:resolve('bridge.py'),python:async()=>({executable:'python3',prefix:[],description:'test'}),changed:()=>{}};
  const session=new Session(record,join(dir,'log.jsonl'),new NoteWriter(access,record.id,'A.md'),host);
  try {
    await session.start({id:'shell',name:'测试',executable:'/bin/sh',args:['-c','printf "中文交互\\n"; sleep 0.2; printf "最终输出\\n"'],cwd:''},dir);
    const end=Date.now()+10000;while(session.live && Date.now()<end)await new Promise(r=>setTimeout(r,20));
    await session.stop();assert.equal(record.state,'ended');assert.match(text,/中文交互/);assert.match(text,/最终输出/);
    const raw=await readFile(join(dir,'log.jsonl'),'utf8');
    const events=raw.trim().split('\n').map(line=>JSON.parse(line));assert.equal(events.at(-1).type,'exit');assert.ok(events.some(e=>e.type==='output'));
    const previous=text;
    const recovered=new Session({...record},join(dir,'log.jsonl'),new NoteWriter(access,record.id,'A.md',record.lastHash),host);
    try {await recovered.restore();await recovered.flush();assert.equal(text,previous);assert.equal(recovered.record.state,'ended');}
    finally{recovered.dispose();}
  } finally {await session.stop();session.dispose();await rm(dir,{recursive:true,force:true});}
});
test('日志恢复处理未完成末尾，笔记投影可重建',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agent-recover-'));
  let text='# 恢复\n';const id=randomUUID();
  const record:RecordData={id,path:'R.md',visible:true,profile:'shell',created:'now',state:'running',cwd:'/tmp',executable:'/bin/sh',args:[]};
  const journal=join(dir,'log.jsonl');await writeFile(journal,[{type:'start',seq:1,time:'now',cols:80,rows:20},{type:'output',seq:2,time:'now',data:'已落盘内容\r\n'}].map(e=>JSON.stringify(e)).join('\n')+'\n{"type":');
  const host={bridge:'',python:async()=>({executable:'',prefix:[],description:''}),changed:()=>{}};
  const session=new Session(record,journal,new NoteWriter({read:async()=>text,update:async(_p,fn)=>{text=fn(text);}},id,'R.md'),host);
  try {await session.restore();await session.flush();assert.equal(record.state,'interrupted');assert.match(text,/已落盘内容/);const previous=text;await session.flush();assert.equal(text,previous);assert.match(session.error,/末尾/);}
  finally{session.dispose();await rm(dir,{recursive:true,force:true});}
});

test('真实系统 Shell 可交互运行 CLI，中文结果退出后持续保留',{timeout:30000},async()=>{
  const {defaultShell}=await import('../src/settings');
  const shell=defaultShell(process.platform,process.env),folder=await mkdtemp(join(tmpdir(),'termnote-shell-'));
  const token='中文_'+randomUUID().slice(0,8),id=randomUUID();let text='# Shell 备份\n';
  const record:RecordData={id,path:'Shell.md',visible:true,profile:'shell',created:'now',state:'idle',cwd:'',executable:'',args:[]};
  const host={bridge:resolve('bridge.py'),python:async()=>({executable:process.platform==='win32'?'python':'python3',prefix:[],description:'test'}),changed:()=>{}};
  const session=new Session(record,join(folder,'events.jsonl'),new NoteWriter({read:async()=>text,update:async(_p,fn)=>{text=fn(text);}},id,'Shell.md'),host);
  const args=process.platform==='win32'?['-NoProfile',...shell.args]:/zsh$/.test(shell.executable)?['-f',...shell.args]:/bash$/.test(shell.executable)?['--noprofile','--norc']:shell.args;
  const quote=(value:string)=>process.platform==='win32'?"'"+value.replaceAll("'","''")+"'":"'"+value.replaceAll("'","'\\''")+"'";
  try{
    await session.start({id:'shell',name:'系统终端',...shell,args,cwd:folder},folder);
    const ready=Date.now()+10000;while(record.state==='starting'&&Date.now()<ready)await new Promise(r=>setTimeout(r,20));
    assert.equal(record.state,'running');
    const runner=join(folder,'agent.cjs');
    await writeFile(runner,`process.stdout.write('CLI_' + ${JSON.stringify(token)} + '\\n')`,'utf8');
    session.write((process.platform==='win32'?'& ':'')+quote(process.execPath)+' '+quote(runner)+'\r');
    const until=Date.now()+15000;while(!text.includes('CLI_'+token)&&Date.now()<until){await session.flush();await new Promise(r=>setTimeout(r,30));}
    assert.ok(text.includes('CLI_'+token),text);
    session.write('exit\r');
    const end=Date.now()+10000;while(session.live&&Date.now()<end)await new Promise(r=>setTimeout(r,25));
    await session.stop();assert.equal(record.state,'ended');assert.equal(session.saveError,'');assert.ok(text.includes('CLI_'+token));
  }finally{await session.stop();session.dispose();await rm(folder,{recursive:true,force:true});}
});

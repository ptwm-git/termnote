import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,appendFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Transcript} from '../src/transcript';
import {Session} from '../src/session';
import {NoteWriter} from '../src/writer';
import {checkedEvent} from '../src/event';
import type {BridgeEvent,RecordData} from '../src/types';

async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'termnote-sync-')),id=randomUUID();let text='# 原文\n';
 const record:RecordData={id,transcriptVersion:2,path:'Sync.md',visible:true,profile:'shell',created:'now',state:'idle',cwd:dir,executable:'',args:[]};
 const access={read:async()=>text,update:async(_p:string,fn:(s:string)=>string)=>{text=fn(text);}},host={bridge:resolve('bridge.py'),python:async()=>({executable:process.platform==='win32'?'python':'python3',prefix:[],description:'test'}),changed:()=>{}};
 const s=new Session(record,join(dir,'log.jsonl'),new NoteWriter(access,id,'Sync.md'),host);await s.initialize();await s.flush();
 const emit=async(data:string)=>{const e:BridgeEvent={type:'output',seq:s.seq+1,time:'t',data};await appendFile(s.journal,JSON.stringify(e)+'\n');await (s as any).ingest(e);await s.flush();};
 return {dir,s,record,access,host,emit,get text(){return text;},async end(){await s.stop();s.dispose();await rm(dir,{recursive:true,force:true});}};
}
test('OFF不写笔记，停止/重载/精简副本遵守持久边界，再ON不补录',async()=>{
 const f=await fixture();try{
  await f.emit('ON_FIRST\r\n');await f.s.setRecording(false);const frozen=f.text;
  await f.emit('OFF_PRIVATE\r\n');await f.s.stop();assert.equal(f.text,frozen);assert.match(await readFile(f.s.journal,'utf8'),/OFF_PRIVATE/);
  const loaded=new Session({...f.record},f.s.journal,new NoteWriter(f.access,f.record.id,'Sync.md',f.record.lastHash),f.host);
  try{
   await loaded.restore();assert.equal(loaded.syncEnabled,false);await loaded.flush();assert.equal(f.text,frozen);assert.doesNotMatch(await loaded.compactContent(),/OFF_PRIVATE/);
   await loaded.setRecording(true);assert.doesNotMatch(f.text,/OFF_PRIVATE/);assert.match(f.text,/ON_FIRST/);
   await (loaded as any).ingest({type:'output',seq:loaded.seq+1,time:'t',data:'ON_SECOND\r\n'});await loaded.flush();assert.match(f.text,/ON_SECOND/);assert.doesNotMatch(f.text,/OFF_PRIVATE/);
  }finally{loaded.dispose();}
 }finally{await f.end();}
});
test('同步控制未落盘则不改变状态，非法控制日志不能恢复',async()=>{
 const f=await fixture();try{
  await rm(f.s.journal);await mkdir(f.s.journal);await assert.rejects(f.s.setRecording(false));assert.equal(f.s.syncEnabled,true);assert.equal(f.s.syncPending,false);
  assert.throws(()=>checkedEvent({type:'recording',seq:1,time:'t',enabled:'yes'}),/格式损坏/);
 }finally{await f.end();}
});
test('OFF中已有行的继续流式输出只保留重新ON后的新增尾部',async()=>{
 const t=new Transcript();try{
  await t.feed('保留\r\n');await t.setRecording(false);await t.feed('关闭期间文字');await t.setRecording(true);await t.feed('开启后尾部\r\n');const text=await t.render();
  assert.match(text,/保留/);assert.match(text,/开启后尾部/);assert.doesNotMatch(text,/关闭期间文字/);
 }finally{t.dispose();}
});
test('全屏OFF历史重绘不补录，ON之后的新行继续记录',async()=>{
 const t=new Transcript(60,10),frame=(text:string)=>'\x1b[?2026h\x1b[H\x1b[2J'+text.replaceAll('\n','\r\n')+'\x1b[?2026l';try{
  await t.feed('\x1b[?1049h'+frame('ON_FIRST'));await t.setRecording(false);await t.feed(frame('ON_FIRST\nOFF_PRIVATE'));await t.setRecording(true);await t.feed(frame('ON_FIRST\nOFF_PRIVATE\nON_SECOND'));
  const text=await t.render();assert.equal(text.split('ON_FIRST').length-1,1);assert.match(text,/ON_SECOND/);assert.doesNotMatch(text,/OFF_PRIVATE/);
 }finally{t.dispose();}
});
test('真实PTY的同步确认与输出共用持久序列，关闭期间输入输出不进入笔记',{timeout:30000},async()=>{
 const f=await fixture(),wait=async(fn:()=>boolean)=>{const end=Date.now()+12000;while(!fn()&&Date.now()<end){await f.s.flush();await new Promise(r=>setTimeout(r,20));}assert.ok(fn(),f.s.error||f.s.saveError);};
 try{
  const runner=join(f.dir,'prompt.py');await writeFile(runner,'for i in range(3):\n x=input("READY> ")\n print("ANSWER:"+x,flush=True)\n');
  await f.s.start({id:'shell',name:'test',executable:process.platform==='win32'?'python':'python3',args:['-u',runner],cwd:f.dir},f.dir);
  await wait(()=>f.s.record.state==='running'&&f.text.includes('READY>'));
  f.s.write('VISIBLE_ONE\r');await wait(()=>f.text.includes('ANSWER:VISIBLE_ONE'));
  await f.s.setRecording(false);const frozen=f.text;f.s.write('OFF_PRIVATE\r');await wait(()=>f.s.seq>6);await new Promise(r=>setTimeout(r,200));await f.s.flush();assert.equal(f.text,frozen);
  await f.s.setRecording(true);f.s.write('VISIBLE_THREE\r');await wait(()=>f.s.record.state==='ended');await f.s.stop();assert.match(f.text,/ANSWER:VISIBLE_THREE/);assert.doesNotMatch(f.text,/OFF_PRIVATE/);
  const events=(await readFile(f.s.journal,'utf8')).trim().split('\n').map(line=>checkedEvent(JSON.parse(line)));
  assert.deepEqual(events.map(e=>e.seq),events.map((_,i)=>i+1));assert.deepEqual(events.filter(e=>e.type==='recording').map(e=>e.enabled),[false,true]);
  const loaded=new Session({...f.record},f.s.journal,new NoteWriter(f.access,f.record.id,'Sync.md',f.record.lastHash),f.host);try{const before=f.text;await loaded.restore();await loaded.flush();assert.equal(f.text,before);}finally{loaded.dispose();}
 }finally{await f.end();}
});

test('OFF基线跨alternate重入和物理换行重排保留，新ON重复行及子串仍归档',async()=>{
 const frame=(s:string)=>'\x1b[?2026h\x1b[H\x1b[2J'+s.replaceAll('\n','\r\n')+'\x1b[?2026l';
 for(const mode of ['reentry','reflow','repeat','substring']){
  const t=new Transcript(40,10);try{
   const off=mode==='repeat'?'RESULT_OK':mode==='substring'?'Error detail unavailable':'OFF_PRIVATE_LONG';
   await t.feed('\x1b[?1049h'+frame('ON_FIRST'));await t.setRecording(false);await t.feed(frame('ON_FIRST\n'+off));await t.setRecording(true);
   if(mode==='reentry')await t.feed('\x1b[?1049l\x1b[?1049h');
   const next=mode==='reflow'?'ON_FIRST\nOFF_PRIVATE\n_LONG\nNEW':mode==='repeat'?'ON_FIRST\nRESULT_OK\nRESULT_OK':mode==='substring'?'ON_FIRST\nError detail unavailable\nError':'ON_FIRST\nOFF_PRIVATE_LONG\nNEW';
   await t.feed(frame(next));const text=await t.render();
   if(mode==='repeat')assert.equal(text.split('RESULT_OK').length-1,1,text);
   else if(mode==='substring'){assert.match(text,/\nError\n/);assert.doesNotMatch(text,/detail unavailable/);}
   else{assert.doesNotMatch(text,/OFF_PRIVATE|_LONG/);assert.match(text,/NEW/);}
  }finally{t.dispose();}
 }
});
test('截断日志不能恢复覆盖笔记或附加同步控制，失败保留原始字节',async()=>{
 const f=await fixture();try{
  await f.emit('完整前缀\r\n');await appendFile(f.s.journal,'{"type":"output","seq":2,"data":"未完成');const raw=await readFile(f.s.journal,'utf8');
  await f.access.update('',t=>t.replace('完整前缀','必须保留的人工文字'));const before=f.text;
  const loaded=new Session({...f.record},f.s.journal,new NoteWriter(f.access,f.record.id,'Sync.md',f.record.lastHash),f.host);
  try{await loaded.restore();await assert.rejects(loaded.recoverNote(before),/不完整/);await assert.rejects(loaded.setRecording(false),/不完整/);assert.equal(f.text,before);assert.equal(await readFile(f.s.journal,'utf8'),raw);}finally{loaded.dispose();}
 }finally{await f.end();}
});
test('旧v2投影升级加载/退出不静默改写已保存原件',async()=>{
 const f=await fixture();try{
  await f.emit('已有对话\r\n');delete f.record.recordingVersion;await f.access.update('',t=>t.replace('已有对话','已有对话\n旧版界面提示'));const before=f.text;
  const loaded=new Session({...f.record},f.s.journal,new NoteWriter(f.access,f.record.id,'Sync.md'),f.host);
  try{await loaded.restore();await loaded.flush();await loaded.stop();assert.equal(f.text,before);}finally{loaded.dispose();}
 }finally{await f.end();}
});

test('全屏同一流式行多次OFF/ON只保留各段ON增量',async()=>{
 for(const offChanges of [true,false]){const t=new Transcript(40,10),frame=(s:string)=>'\x1b[?2026h\x1b[H\x1b[2J'+s+'\x1b[?2026l';try{
  await t.feed('\x1b[?1049h');await t.setRecording(false);await t.feed(frame('OFF_A'));await t.setRecording(true);await t.feed(frame('OFF_A_ON_B'));await t.setRecording(false);
  if(offChanges)await t.feed(frame('OFF_A_ON_B_OFF_C'));await t.setRecording(true);await t.feed(frame('OFF_A_ON_B'+(offChanges?'_OFF_C':'')+'_ON_D'));
  const text=await t.render();assert.doesNotMatch(text,/OFF_A|OFF_C/);assert.equal(text.split('_ON_B').length-1,1,text);assert.equal(text.split('_ON_D').length-1,1,text);
 }finally{t.dispose();}}
});

test('离线控制fsync失败后禁止追加重试，不产生重复序号',async()=>{
 const f=await fixture(),fs:any=(await import('node:module')).createRequire(import.meta.url)('node:fs/promises'),original=fs.open;let fail=true;
 fs.open=async(...args:any[])=>{const file=await original(...args);if(args[0]===f.s.journal&&args[1]==='a'&&fail){fail=false;file.sync=async()=>{throw Error('injected fsync failure');};}return file;};
 try{await assert.rejects(f.s.setRecording(false),/未能确认写入/);const raw=await readFile(f.s.journal,'utf8');await assert.rejects(f.s.setRecording(false),/不完整/);assert.equal(await readFile(f.s.journal,'utf8'),raw);assert.throws(()=>f.s.assertCompleteHistory(),/不完整/);}
 finally{fs.open=original;await f.end();}
});
test('实时序号跳跃立刻标为日志故障并拒绝恢复',async()=>{
 const f=await fixture();try{const before=f.text;await assert.rejects((f.s as any).ingest({type:'output',seq:2,time:'t',data:'不得覆盖'}),/序号不连续/);await assert.rejects(f.s.recoverNote(before),/不完整/);assert.equal(f.text,before);}finally{await f.end();}
});
test('运行中控制日志部分写入失败会停止追加并拒绝恢复',{skip:process.platform==='win32',timeout:20000},async()=>{
 const f=await fixture();try{
  const faulty=join(f.dir,'faulty.py');await writeFile(faulty,`import importlib.util\nspec=importlib.util.spec_from_file_location('b',${JSON.stringify(resolve('bridge.py'))})\nb=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(b)\noriginal=b.Journal.emit\nclass BrokenFile:\n def __init__(self,f): self.f=f\n def write(self,data):\n  self.f.write(bytes(data)[:15])\n  raise OSError('injected partial write')\n def fileno(self): return self.f.fileno()\ndef emit(self,kind,**payload):\n if kind=='recording':\n  old=self.file\n  self.file=BrokenFile(old)\n  try: return original(self,kind,**payload)\n  finally: self.file=old\n return original(self,kind,**payload)\nb.Journal.emit=emit\nb.main()\n`);
  (f.host as any).bridge=faulty;await f.s.start({id:'shell',name:'test',executable:'/bin/sh',args:['-c','echo READY; sleep 8'],cwd:f.dir},f.dir);
  const end=Date.now()+10000;while(f.s.seq<2&&Date.now()<end)await new Promise(r=>setTimeout(r,15));await assert.rejects(f.s.setRecording(false));await f.s.stop();
  assert.match(f.record.journalError!,/日志写入失败/);const raw=await readFile(f.s.journal,'utf8');assert.doesNotMatch(raw,/"type": "exit"/);await assert.rejects(f.s.recoverNote(f.text),/不完整/);await assert.rejects(f.s.setRecording(false),/不完整/);assert.equal(await readFile(f.s.journal,'utf8'),raw);
 }finally{await f.end();}
});

test('同步绘制事务跨开关时以事件边界记录ON文字，不回填OFF',async()=>{
 const t=new Transcript(40,10);try{
  await t.feed('\x1b[?1049h');await t.setRecording(false);await t.feed('\x1b[?2026h\x1b[H\x1b[2JOFF_SECRET');await t.setRecording(true);await t.feed('_ON_SUFFIX\x1b[?2026l');
  let text=await t.render();assert.doesNotMatch(text,/OFF_SECRET/);assert.match(text,/_ON_SUFFIX/);
  await t.feed('\x1b[?2026h\x1b[2J\x1b[HON_PREFIX');await t.setRecording(false);await t.feed('_OFF_SUFFIX\x1b[?2026l');text=await t.render();assert.match(text,/ON_PREFIX/);assert.doesNotMatch(text,/_OFF_SUFFIX/);
 }finally{t.dispose();}
});
test('OFF普通行在ON后被回车整行重写时保留新的完整内容',async()=>{
 for(const value of ['ON_PUBLIC_ANSWER','OFF']){const t=new Transcript();try{
  await t.setRecording(false);await t.feed('OFF_SECRET');await t.setRecording(true);await t.feed('\r'+value+'\x1b[K\r\n');const text=await t.render();assert.doesNotMatch(text,/OFF_SECRET/);assert.ok(text.includes(value),text);
 }finally{t.dispose();}}
});

test('ON普通行改写不携带未擦除的OFF尾部，明确擦除后的同文尾部保留',async()=>{
 for(const erased of [false,true]){const t=new Transcript();try{
  await t.setRecording(false);await t.feed('OFF_SECRET');await t.setRecording(true);await t.feed(erased?'\rON_SECRET\x1b[K\r\n':'\rPUBLIC\r\n');const text=await t.render();
  if(erased)assert.match(text,/ON_SECRET/);else{assert.match(text,/PUBLIC/);assert.doesNotMatch(text,/CRET|OFF_SECRET/);}
 }finally{t.dispose();}}
});

test('OFF之后新一轮的相同回答仍作为新ON输出保留',async()=>{
 const t=new Transcript(50,10),frame=(s:string)=>'\x1b[?2026h\x1b[H\x1b[2J'+s.replaceAll('\n','\r\n')+'\x1b[?2026l';try{
  await t.feed('\x1b[?1049h');await t.setRecording(false);await t.feed(frame('SAME_ANSWER'));await t.setRecording(true);
  await t.interaction({type:'interaction',seq:1,time:'t',action:'edit'});await t.interaction({type:'interaction',seq:2,time:'t',action:'submit',data:'新问题'});await t.feed(frame('SAME_ANSWER'));
  assert.equal((await t.render()).split('SAME_ANSWER').length-1,1,await t.render());
 }finally{t.dispose();}
});

test('普通行覆盖后独立换行或继续写入的分包均不带回OFF残留尾部',async()=>{
 for(const chunks of [['\rPUBLIC','\r\n'],['\rPUBLIC','!','\r\n'],['\rPUBLIC','\rON_SECRET\x1b[K','\r\n']]){const t=new Transcript();try{
  await t.setRecording(false);await t.feed('OFF_SECRET');await t.setRecording(true);for(const chunk of chunks)await t.feed(chunk);const text=await t.render();
  if(chunks.some(s=>s.includes('ON_SECRET')))assert.match(text,/ON_SECRET/);else{assert.match(text,chunks.includes('!')?/PUBLIC!/:/PUBLIC/);assert.doesNotMatch(text,/CRET|RET|OFF_SECRET/);}
 }finally{t.dispose();}}
});
test('OFF全屏行在alternate重入后反序重绘仍不回填，额外同文行保留一次',async()=>{
 const frame=(s:string)=>'\x1b[?2026h\x1b[H\x1b[2J'+s.replaceAll('\n','\r\n')+'\x1b[?2026l';
 for(const repeat of [false,true]){const t=new Transcript(40,10);try{
  await t.feed('\x1b[?1049h');await t.setRecording(false);await t.feed(frame('OFF_ALPHA\nOFF_BETA'));await t.setRecording(true);await t.feed('\x1b[?1049l\x1b[?1049h');await t.feed(frame('OFF_BETA\nOFF_ALPHA'+(repeat?'\nOFF_ALPHA':'')+'\nON_NEW'));
  const text=await t.render();assert.doesNotMatch(text,/OFF_BETA/);assert.equal(text.split('OFF_ALPHA').length-1,repeat?1:0,text);assert.match(text,/ON_NEW/);
 }finally{t.dispose();}}
});
test('普通行按ON实际打印列记录，横跳旧尾部不回填，同文覆盖不误删',async()=>{
 for(const chunks of [['\rPUBLIC','\x1b[5C!','\r\n'],['\rON_SECRET','T','\r\n'],['\r中文','\x1b[31m新字\x1b[0m','\r\n']]){const t=new Transcript();try{
  await t.setRecording(false);await t.feed('OFF_SECRET');await t.setRecording(true);for(const chunk of chunks)await t.feed(chunk);const text=await t.render();
  assert.doesNotMatch(text,/OFF_SECRET/);if(chunks[0].includes('ON_SECRET'))assert.match(text,/ON_SECRETT/);else if(chunks[0].includes('中文'))assert.match(text,/中文新字/);else {assert.match(text,/PUBLIC\s+!/);assert.doesNotMatch(text,/CRET/);}
  await t.feed('NEXT\r\n');assert.match(await t.render(),/NEXT/);assert.equal((t as any).plainOrigin,undefined);
 }finally{t.dispose();}}
});
test('普通行插入删除字符及插入模式同步移动来源列，同包分包一致',async()=>{
 for(const edit of ['\r\x1b[3P','\r\x1b[3@','\r\x1b[4hABC\x1b[4l'])for(const split of [true,false]){const t=new Transcript();try{
  await t.setRecording(false);await t.feed('OFF_SECRET');await t.setRecording(true);await t.feed('\rPUBLIC');if(split){await t.feed(edit);await t.feed('\r\n');}else await t.feed(edit+'\r\n');const text=await t.render();
  assert.doesNotMatch(text,/CRET|OFF_SECRET/);assert.match(text,edit.includes('3P')?/\nLIC\n/:edit.includes('4h')?/ABCPUBLIC/:/PUBLIC/);
 }finally{t.dispose();}}
});

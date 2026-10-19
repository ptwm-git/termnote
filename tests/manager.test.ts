import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {DEFAULT_SETTINGS,type PluginData} from '../src/types';
import {binding,patchNote} from '../src/note';

// Exercise the real Manager/Session/writer against an in-memory Obsidian file API.
let Manager:any,FileSystemAdapter:any,TFile:any,TFolder:any;
const api=build({stdin:{contents:"export {Manager} from './src/manager';export {FileSystemAdapter,TFile,TFolder} from 'obsidian';",resolveDir:resolve('.'),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent',plugins:[{name:'obsidian-test-api',setup(builder){
  builder.onResolve({filter:/^obsidian$/},()=>({path:'api',namespace:'test'}));
  builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
    export class FileSystemAdapter {constructor(root){this.root=root;}getBasePath(){return this.root;}}
    export class TFile {constructor(path){this.path=path;}get extension(){return this.path.split('.').pop();}get basename(){return this.path.split('/').pop().replace(/\\.md$/,'');}}
    export class TFolder {constructor(path){this.path=path;}}
    export class MarkdownView {} export class App {} export class Notice {constructor(){}}
  `,loader:'js'}));
}}]}).then(compiled=>{
  const builtModule={exports:{} as any};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(resolve('package.json')),builtModule,builtModule.exports);
  ({Manager,FileSystemAdapter,TFile,TFolder}=builtModule.exports);
});

async function fixture(){
  await api;
  const root=await mkdtemp(join(tmpdir(),'termnote-manager-')),files=new Map<string,any>(),texts=new Map<string,string>(),trash=new Map<string,string>();
  const data:PluginData={settings:structuredClone(DEFAULT_SETTINGS),records:[],counters:{}};
  const adapter=new FileSystemAdapter(root);adapter.exists=async(path:string)=>files.has(path);
  const vault={adapter,getFileByPath:(path:string)=>files.get(path) instanceof TFile?files.get(path):null,getAbstractFileByPath:(path:string)=>files.get(path),getFolderByPath:(path:string)=>files.get(path) instanceof TFolder?files.get(path):null,
    async create(path:string,text:string){if(files.has(path))throw Error('exists');const file=new TFile(path);files.set(path,file);texts.set(path,text);return file;},
    async read(file:any){if(!texts.has(file.path))throw Error('read failed');return texts.get(file.path)!;},
    async process(file:any,fn:(text:string)=>string){texts.set(file.path,fn(await this.read(file)));}
  };
  const app={vault,workspace:{getLeavesOfType:()=>[]},fileManager:{generateMarkdownLink:(file:any)=>'[['+file.path+']]',async trashFile(file:any){trash.set(file.path,texts.get(file.path)!);files.delete(file.path);texts.delete(file.path);}}};
  let stored=structuredClone(data),fail:(data:PluginData)=>boolean=()=>false;
  const persist=async()=>{if(fail(data))throw Error('index unavailable');stored=structuredClone(data);};
  const manager=new Manager(app,data,'',persist);await manager.load();
  return {root,app,manager,data,files,texts,trash,get stored(){return stored;},setFailure:(fn:typeof fail)=>fail=fn,async end(){fail=()=>false;await manager.shutdown();await rm(root,{recursive:true,force:true});}};
}
test('新文件填补最小空缺、忽略旧高水位，换目录独立编号且不复用旧会话',async()=>{
  const f=await fixture();try{
    f.data.counters['']=99;const one=await f.manager.newNote(''),two=await f.manager.newNote(''),three=await f.manager.newNote('');
    assert.equal(one.record.path,'终端页面一.md');assert.equal(three.record.path,'终端页面三.md');
    for(const s of [two,three]){f.files.delete(s.record.path);f.texts.delete(s.record.path);await f.manager.deleted(s.record.path);}
    const next=await f.manager.newNote('');assert.equal(next.record.path,two.record.path);assert.notEqual(next.record.id,two.record.id);
    await two.flush();assert.equal(binding(f.texts.get(next.record.path)!),next.record.id);
    assert.equal((await f.manager.newNote('')).record.path,'终端页面三.md');
    f.files.set('sub',new TFolder('sub'));assert.equal((await f.manager.newNote('sub')).record.path,'sub/终端页面一.md');
    f.files.set('终端页面四.md',new TFolder('终端页面四.md'));assert.equal((await f.manager.newNote('')).record.path,'终端页面五.md');
    const previous=next.record.path,moved=f.files.get(previous),body=f.texts.get(previous)!;f.files.delete(previous);f.texts.delete(previous);moved.path='改名.md';f.files.set(moved.path,moved);f.texts.set(moved.path,body);await f.manager.renamed(moved,previous);
    assert.equal((await f.manager.newNote('')).record.path,previous);
  }finally{await f.end();}
});
test('保存关闭等待尾部输出落盘、关闭期间拒绝重启，保留文件与日志',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');let release!:()=>void,entered!:()=>void;
    const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r),stop=s.stop.bind(s);
    s.stop=async()=>{entered();await gate;await s.transcript.feed('最后一行\r\n');s.revision++;await stop();};
    const closing=f.manager.closeSession(s,true);await ready;
    assert.equal(s.record.visible,true);await assert.rejects(f.manager.launch(s),/正在关闭/);release();await closing;
    assert.equal(s.record.visible,false);assert.match(f.texts.get(s.record.path)!,/最后一行/);await access(s.journal);assert.equal(f.trash.size,0);
  }finally{await f.end();}
});
test('不保存只移除生成的备份和自己的三份日志，来源及其他会话保持完整',async()=>{
  const f=await fixture();try{
    const source=await f.app.vault.create('来源.md','# 用户原文'),s=await f.manager.newNote('',source.path),other=await f.manager.newNote('');
    const otherText=f.texts.get(other.record.path),otherRaw=await readFile(other.journal,'utf8');
    await writeFile(s.journal.replace(/\.jsonl$/,'.opencode.json'),'{}');let disposed=false;f.manager.beforeClose.add(async(id:string)=>{if(id===s.record.id)disposed=true;});
    await f.manager.closeSession(s,false);assert.ok(disposed);assert.ok(f.trash.has(s.record.path));assert.equal(f.files.has(s.record.path),false);
    assert.equal(f.texts.get(source.path),'# 用户原文');assert.equal(f.texts.get(other.record.path),otherText);assert.equal(await readFile(other.journal,'utf8'),otherRaw);
    for(const suffix of ['.jsonl','.projection.json','.opencode.json'])await assert.rejects(access(join(f.root,'.agent-note-terminal',s.record.id+suffix)));
    assert.equal(f.data.records.some((r:any)=>r.id===s.record.id),false);assert.equal(f.manager.sessions.has(s.record.id),false);
  }finally{await f.end();}
});
test('历史原文与被其他文件替换的路径不能被不保存删除',async()=>{
  const f=await fixture();try{
    const original=await f.app.vault.create('原文.md','# 原文'),attached=await f.manager.attach(original);
    await assert.rejects(f.manager.closeSession(attached,false),/不是可确认/);assert.ok(f.files.has(original.path));
    const s=await f.manager.newNote('');f.texts.set(s.record.path,'另一个文件');
    await assert.rejects(f.manager.closeSession(s,false),/已保留文件/);assert.equal(f.texts.get(s.record.path),'另一个文件');assert.equal(f.trash.size,0);await access(s.journal);
  }finally{await f.end();}
});
test('保存冲突不隐藏标签，删除意图保存失败时不删除文件',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');s.historyError='损坏';await assert.rejects(f.manager.closeSession(s,true),/尚未完整保存/);assert.equal(s.record.visible,true);s.historyError='';
    f.setFailure(d=>d.records.some(r=>r.discarded));await assert.rejects(f.manager.closeSession(s,false),/index unavailable/);
    assert.equal(s.record.visible,true);assert.equal(s.record.discarded,undefined);assert.ok(f.files.has(s.record.path));assert.equal(f.trash.size,0);
  }finally{await f.end();}
});
test('回收站失败可重试；最终索引失败保留已落盘意图供重载清理',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote(''),trash=f.app.fileManager.trashFile;
    f.app.fileManager.trashFile=async()=>{throw Error('trash denied');};await assert.rejects(f.manager.closeSession(s,false),/trash denied/);
    assert.ok(f.files.has(s.record.path));assert.equal(s.record.discarded,undefined);assert.equal(s.record.visible,true);
    f.app.fileManager.trashFile=trash;f.setFailure(d=>!d.records.some((r:any)=>r.id===s.record.id));assert.match(await f.manager.closeSession(s,false),/索引同步失败/);
    assert.equal(f.stored.records.find(r=>r.id===s.record.id)?.discarded,true);assert.equal(f.files.has(s.record.path),false);
    f.setFailure(()=>false);const recovered=new Manager(f.app,structuredClone(f.stored),'',async()=>{});await recovered.load();assert.equal(recovered.data.records.length,0);await recovered.shutdown();
  }finally{await f.end();}
});
test('日志清理失败保留意图；重载保护同路径新文件并清理旧日志',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');(f.manager as any).cleanupOwned=async()=>['busy.jsonl'];assert.match(await f.manager.closeSession(s,false),/日志仍待清理/);
    const text=patchNote('# 新文件','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','新会话',null);await f.app.vault.create(s.record.path,text);
    const recovered=new Manager(f.app,structuredClone(f.stored),'',async()=>{});await recovered.load();
    assert.equal(recovered.data.records.length,0);assert.equal(f.texts.get(s.record.path),text);await assert.rejects(access(s.journal));await recovered.shutdown();
  }finally{await f.end();}
});
test('中断删除时原绑定文件仍存在，重载保留文件并恢复可见标签',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');s.record.discarded=true;s.record.visible=false;const before=f.texts.get(s.record.path);
    const recovered=new Manager(f.app,structuredClone(f.data),'',async()=>{});await recovered.load();
    assert.equal(recovered.data.records[0].discarded,undefined);assert.equal(recovered.data.records[0].visible,true);assert.equal(f.texts.get(s.record.path),before);assert.equal(f.trash.size,0);await recovered.shutdown();
  }finally{await f.end();}
});
test('中断删除的归属读取失败，停止和退出也不能用空历史覆盖原文',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');s.record.discarded=true;const text=f.texts.get(s.record.path),read=f.app.vault.read;
    f.app.vault.read=async()=>{throw Error('temporarily unreadable');};
    const recovered=new Manager(f.app,structuredClone(f.data),'',async()=>{});await recovered.load();
    f.app.vault.read=read;const restored=recovered.sessions.get(s.record.id);assert.match(restored.historyError,/无法核验/);
    await assert.rejects(recovered.closeSession(restored,true),/尚未完整保存/);await recovered.shutdown();assert.equal(f.texts.get(s.record.path),text);assert.equal(f.trash.size,0);await access(s.journal);
  }finally{await f.end();}
});
test('旧会话继续副本创建途中关闭，启动与关闭串行且不遗留孤儿进程或文件',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote(''),original=s.record.path,create=f.app.vault.create;
    s.legacyFrozen=true;s.seq=1;s.record.state='failed';let entered!:()=>void,release!:()=>void,started=0;
    const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
    f.app.vault.create=async(path:string,text:string)=>{if(path.includes('（继续）')){entered();await gate;}return create(path,text);};
    s.start=async()=>{started++;s.record.state='running';};
    const launching=f.manager.launch(s);await ready;let closed=false;const closing=f.manager.closeSession(s,false).then(()=>closed=true);
    await assert.rejects(f.manager.launch(s),/正在关闭/);await assert.rejects(f.manager.closeSession(s,false),/正在关闭/);assert.equal(closed,false);
    release();await launching;await closing;assert.equal(started,1);assert.equal(s.live,false);assert.equal(f.manager.sessions.has(s.record.id),false);
    assert.ok(f.files.has(original));assert.equal(f.files.has(s.record.path),false);assert.ok(f.trash.has(s.record.path));
    await access(s.journal);assert.equal(s.record.sharedArchive,true);
  }finally{await f.end();}
});
test('历史原生记录同步失败时保存关闭报错并保持标签可见',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');s.nativeError='export failed';await assert.rejects(f.manager.closeSession(s,true),/export failed/);
    assert.equal(s.record.visible,true);assert.ok(f.files.has(s.record.path));await access(s.journal);
  }finally{await f.end();}
});
test('关闭释放回放文件期间及移除索引后都不能启动原生补齐',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote('');let entered!:()=>void,release!:()=>void,refreshed=0;
    const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);s.refreshNative=async()=>{refreshed++;};
    f.manager.beforeClose.add(async()=>{entered();await gate;});const closing=f.manager.closeSession(s,false);await ready;
    await assert.rejects(f.manager.refreshNative(s),/正在关闭/);release();await closing;await assert.rejects(f.manager.refreshNative(s),/已关闭/);assert.equal(refreshed,0);await assert.rejects(access(s.journal));
  }finally{await f.end();}
});
test('旧继续副本迁移识别共享归档，丢弃及重载清理均保留历史恢复来源',async()=>{
  const f=await fixture();try{
    const s=await f.manager.newNote(''),original=s.record.path,copy='继续副本.md';await f.app.vault.create(copy,f.texts.get(original)!);s.record.sourcePath=original;s.record.path=copy;s.writer.path=copy;
    await writeFile(s.journal.replace(/\.jsonl$/,'.opencode.json'),'history');const archive=await readFile(s.journal,'utf8');
    const recovered=new Manager(f.app,structuredClone(f.data),'',async()=>{});await recovered.load();const restored=recovered.sessions.get(s.record.id);assert.equal(restored.record.sharedArchive,true);
    assert.match(await recovered.closeSession(restored,false),/共享/);assert.equal(await readFile(s.journal,'utf8'),archive);assert.equal(await readFile(s.journal.replace(/\.jsonl$/,'.opencode.json'),'utf8'),'history');assert.ok(f.files.has(original));
    const pending=structuredClone(f.data);pending.records[0].sharedArchive=true;pending.records[0].discarded=true;const retry=new Manager(f.app,pending,'',async()=>{});await retry.load();await access(s.journal);assert.equal(retry.data.records.length,0);await retry.shutdown();await recovered.shutdown();
  }finally{await f.end();}
});

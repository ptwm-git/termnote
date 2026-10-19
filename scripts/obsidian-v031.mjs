// Uses a fresh fixture in test-vault and an isolated OpenCode with a local model.
import {createServer} from 'node:http';
import {mkdtemp,writeFile,chmod} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {OpenCodeServer} from '../src/opencode.ts';
const cliEnv={...process.env};
const exec=promisify(execFile),vault=resolve('../test-vault'),dir=await mkdtemp(join(tmpdir(),'termnote-031-cli-'));
async function ev(fn,...args){
 const code='(async()=>{if(app.vault.adapter.getBasePath()!=='+JSON.stringify(vault)+')throw Error("Refusing non-test vault");return await ('+fn.toString()+')(...'+JSON.stringify(args)+');})()';
 const {stdout}=await exec('obsidian',['eval','code='+code],{cwd:vault,env:cliEnv,timeout:60000,maxBuffer:2e6});const result=stdout.slice(stdout.indexOf('=>')+2).trim();try{return JSON.parse(result);}catch{throw Error(result);}
}
let calls=0,id,service;
const mock=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');calls++;
 const content='本地回答：增量归档验证成功。';
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const part of [content.slice(0,5),content.slice(5)])res.write('data: '+JSON.stringify({id:'test',object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:part},finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({id:'test',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:15,total_tokens:25}})+'\n\ndata: [DONE]\n\n');
});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const config={model:'termnote/test',small_model:'termnote/test',provider:{termnote:{npm:'@ai-sdk/openai-compatible',name:'TermNote local test',options:{baseURL:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'local-fixture'},models:{test:{name:'test',limit:{context:32000,output:2048}},test2:{name:'test2',limit:{context:32000,output:2048}}}}}};
const env={HOME:dir,OPENCODE_CONFIG_CONTENT:JSON.stringify(config)};for(const key of ['CONFIG','DATA','CACHE','STATE'])env[`XDG_${key}_HOME`]=join(dir,key.toLowerCase());
const binary=process.env.TERMNOTE_OPENCODE||join(homedir(),'.opencode/bin/opencode'),wrapper=join(dir,'agent');
async function saveWrapper(extra={}){await writeFile(wrapper,'#!/usr/bin/env python3\nimport os,sys,json\nos.environ.update(json.loads('+JSON.stringify(JSON.stringify({...env,...extra}))+'))\nos.execv('+JSON.stringify(binary)+',['+JSON.stringify(binary)+',*sys.argv[1:]])\n');await chmod(wrapper,0o700);}
await saveWrapper();
for(const [key,value]of Object.entries(env))process.env[key]=value;
const profile={id:'fixture',name:'local',executable:wrapper,args:[],cwd:dir,adapter:'opencode',model:'termnote/test'};
service=new OpenCodeServer();await service.start({bridge:resolve('bridge.py'),python:async()=>({executable:'python3',prefix:[],description:'fixture'})},profile,dir);const binding=await service.bind(profile);await saveWrapper(service.environment);
const terminalArgs=service.terminalArgs(binding,profile);
async function send(text,enter=true){return ev(async(id,text,enter)=>{const p=app.plugins.plugins['agent-note-terminal'],s=p.manager.sessions.get(id),v=await p.getView();v.select(s);const t=v.panes.get(id).terminal;t.paste(text);if(enter)t.input(String.fromCharCode(13),true);return JSON.stringify({sent:true});},id,text,enter);}
async function state(){return ev(async id=>{const p=app.plugins.plugins['agent-note-terminal'],s=p.manager.sessions.get(id),t=s.transcript.terminal,b=t.buffer.active,lines=[];for(let y=0;y<t.rows;y++)lines.push(b.getLine(b.baseY+y)?.translateToString(true)||'');return JSON.stringify({state:s.record.state,error:s.error,body:await s.content(),screen:lines.join(String.fromCharCode(10)),format:s.record.transcriptVersion,native:!!s.record.native});},id);}
try{
 const created=await ev(async()=>{const p=app.plugins.plugins['agent-note-terminal'];if(p.manifest.version!=='0.3.1')throw Error('Install current build');const folder='增量对话验收-'+Date.now();await app.vault.createFolder(folder);const f=await app.vault.create(folder+'/项目方案.md','# 验证增量对话');await app.workspace.getLeaf('tab').openFile(f);await p.openFile(f);const v=await p.getView();return JSON.stringify({id:v.getState().activeId,folder});});id=created.id;
 await new Promise(r=>setTimeout(r,600));await send([wrapper,...terminalArgs].map(value=>"'"+value.replaceAll("'","'\\''")+"'").join(' '));
 let snap;for(let n=0;n<60;n++){snap=await state();if(snap.screen.includes('test')&&!snap.screen.includes('Starting background server'))break;await new Promise(r=>setTimeout(r,250));}
 await writeFile(join(dir,'initial.json'),JSON.stringify(snap,null,2));console.log(JSON.stringify({stage:'started',screen:snap.screen,body:snap.body.slice(-1600),evidence:dir}));
 await send('第一轮：只回答测试结果');
 for(let n=0;n<100;n++){snap=await state();if(snap.body.includes('本地回答：增量归档验证成功。'))break;await new Promise(r=>setTimeout(r,250));}
 await writeFile(join(dir,'first.json'),JSON.stringify(snap,null,2));console.log(JSON.stringify({stage:'first',calls,body:snap.body,screen:snap.screen}));
 assert.ok(snap.body.includes('### 我')&&snap.body.includes('第一轮：只回答测试结果'),'submitted input not labeled');assert.ok(snap.body.includes('本地回答：增量归档验证成功。'),'answer missing');
 assert.ok(snap.body.includes('### 我\n\n```text\n第一轮：只回答测试结果\n'),'question must have its own input block');assert.equal(snap.body.split('第一轮：只回答测试结果').length-1,1,'input echo was duplicated');
 await send('/models');await new Promise(r=>setTimeout(r,600));snap=await state();await writeFile(join(dir,'models.json'),JSON.stringify(snap,null,2));console.log(JSON.stringify({stage:'models',screen:snap.screen,body:snap.body}));
 await send('test2',false);await new Promise(r=>setTimeout(r,300));
 await ev(async id=>{const p=app.plugins.plugins['agent-note-terminal'],v=await p.getView(),t=v.panes.get(id).terminal;for(let n=0;n<10;n++){t.input(String.fromCharCode(27)+'[B',true);t.input(String.fromCharCode(27)+'[A',true);}await new Promise(r=>setTimeout(r,200));t.input(String.fromCharCode(13),true);return JSON.stringify({selected:true});},id);
 await new Promise(r=>setTimeout(r,500));snap=await state();await writeFile(join(dir,'selected.json'),JSON.stringify(snap,null,2));console.log(JSON.stringify({stage:'selected',screen:snap.screen,body:snap.body}));
 if(snap.screen.includes('Select variant')){await ev(async id=>{const p=app.plugins.plugins['agent-note-terminal'],v=await p.getView(),t=v.panes.get(id).terminal;t.input(String.fromCharCode(27)+'[B',true);t.input(String.fromCharCode(27)+'[A',true);t.input(String.fromCharCode(13),true);return JSON.stringify({variant:true});},id);await new Promise(r=>setTimeout(r,400));}
 snap=await state();assert.ok(!snap.screen.includes('Select variant'),'variant confirmation did not close');assert.ok(snap.screen.includes('test2'),'model not selected');assert.ok(snap.body.includes('### 操作'),'selection operation not recorded');
 await send('第二轮：只回答测试结果');
 for(let n=0;n<100;n++){snap=await state();if((snap.body.match(/本地回答：增量归档验证成功。/g)||[]).length>=2)break;await new Promise(r=>setTimeout(r,250));}
 await writeFile(join(dir,'second.json'),JSON.stringify(snap,null,2));assert.ok(snap.body.includes('### 我\n\n```text\n第二轮：只回答测试结果\n'));assert.equal(snap.body.split('Select model').length-1,1,'model list duplicated');assert.equal(snap.body.split('/models').length-1,1,'slash command duplicated');assert.equal((snap.body.match(/本地回答：增量归档验证成功。/g)||[]).length,2,snap.body);assert.equal(snap.native,false);assert.ok(!snap.body.includes('终端界面快照'));
 console.log(JSON.stringify({ok:true,version:'0.3.1',plainShell:true,actualOpenCode:true,inputsAndOutputs:true,twoIdenticalAnswers:true,localModelRequests:calls,evidence:dir,...created}));
}finally{
 if(id)await ev(async id=>{const p=app.plugins.plugins['agent-note-terminal'],s=p.manager.sessions.get(id);if(s)await s.stop();return JSON.stringify({stopped:true});},id).catch(()=>{});
 if(service)await service.stop();
 await new Promise(r=>mock.close(r));
}

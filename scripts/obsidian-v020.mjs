// macOS desktop acceptance. All Agent state and model traffic stay in an isolated test directory.
import{createServer}from'node:http';import{mkdtemp,writeFile,chmod}from'node:fs/promises';
import{tmpdir,homedir}from'node:os';import{join}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';
const exec=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'termnote-obsidian-')),profileID='qa-'+Date.now();
async function ev(code){const{stdout}=await exec('obsidian',['vault=test-vault','eval','code='+code],{timeout:60000,maxBuffer:2e6});const result=stdout.slice(stdout.indexOf('=>')+2).trim();try{return JSON.parse(result);}catch{throw Error(result);}}
let calls=0;
const mock=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');calls++;
  const content='本地模型验证通过：中文回答和会话记录。';
  res.writeHead(200,{'content-type':'text/event-stream'});
  for(const data of [{id:'fixture',object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]},{id:'fixture',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:12,total_tokens:24}}])res.write('data: '+JSON.stringify(data)+'\n\n');res.end('data: [DONE]\n\n');
});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const config={model:'termnote/test',small_model:'termnote/test',provider:{termnote:{npm:'@ai-sdk/openai-compatible',name:'TermNote local fixture',options:{baseURL:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'local-fixture'},models:{test:{name:'test',limit:{context:32000,output:2048}}}}}};
const env={OPENCODE_CONFIG_CONTENT:JSON.stringify(config)};for(const key of ['CONFIG','DATA','CACHE','STATE'])env[`XDG_${key}_HOME`]=join(dir,key.toLowerCase());
const wrapper=join(dir,'opencode-fixture'),binary=process.env.TERMNOTE_OPENCODE||join(homedir(),'.opencode/bin/opencode');
await writeFile(wrapper,'#!/usr/bin/env python3\nimport os,sys,json\nos.environ.update(json.loads('+JSON.stringify(JSON.stringify(env))+'))\nos.execv('+JSON.stringify(binary)+',['+JSON.stringify(binary)+',*sys.argv[1:]])\n');await chmod(wrapper,0o700);
let ids=[];
try {
  const records=await ev(`(async()=>{const p=app.plugins.plugins['agent-note-terminal'],m=p.manager;const profile={id:${JSON.stringify(profileID)},name:'OpenCode 本地模型验收',executable:${JSON.stringify(wrapper)},args:[],cwd:'',adapter:'opencode',model:'termnote/test'};m.data.settings.profiles.push(profile);await m.persist();const folder='TermNote-0.2验收-'+Date.now();await app.vault.createFolder(folder);const sessions=[await m.newNote(folder),await m.newNote(folder)];const view=await p.getView();for(const s of sessions){s.record.profile=profile.id;view.select(s);await m.launch(s);}return sessions.map(s=>({id:s.record.id,path:s.record.path,native:s.record.native,state:s.record.state,error:s.error}));})()`);
  ids=records.map(x=>x.id);assert.equal(records.length,2);assert.ok(records.every(x=>x.native&&!x.error),JSON.stringify(records));assert.notEqual(records[0].native.sessionID,records[1].native.sessionID);
  await new Promise(r=>setTimeout(r,2000));
  for(let i=0;i<2;i++)await ev(`(async()=>{const p=app.plugins.plugins['agent-note-terminal'],s=p.manager.sessions.get(${JSON.stringify(ids[i])});(await p.getView()).select(s);s.write(${JSON.stringify('TERMNOTE-'+i+'-中文对话')});await new Promise(r=>setTimeout(r,300));s.write(String.fromCharCode(13));return true;})()`);
  let results;
  for(let t=0;t<40;t++) {
    results=await ev(`JSON.stringify(${JSON.stringify(ids)}.map((id,i)=>{const s=app.plugins.plugins['agent-note-terminal'].manager.sessions.get(id),body=s.native.render();return {id,state:s.record.state,error:s.error,nativeError:s.nativeError,own:body.includes('TERMNOTE-'+i+'-中文对话'),answer:body.includes('本地模型验证通过'),other:body.includes('TERMNOTE-'+(1-i)+'-中文对话')};}))`);
    if(results.every(x=>x.own&&x.answer&&!x.other))break;await new Promise(r=>setTimeout(r,500));
  }
  await writeFile(join(dir,'results.json'),JSON.stringify(results,null,2));assert.ok(results.every(x=>x.own&&x.answer&&!x.other),JSON.stringify({results,evidence:dir}));
  await ev(`(async()=>{for(const id of ${JSON.stringify(ids)})await app.plugins.plugins['agent-note-terminal'].manager.sessions.get(id).stop();return true;})()`);
  const before=await ev(`JSON.stringify(${JSON.stringify(ids)}.map(id=>{const s=app.plugins.plugins['agent-note-terminal'].manager.sessions.get(id);return{id,native:s.record.native.sessionID,body:s.native.render()};}))`);
  await ev(`(async()=>{await app.plugins.disablePlugin('agent-note-terminal');await app.plugins.enablePlugin('agent-note-terminal');return true;})()`);
  const after=await ev(`JSON.stringify(${JSON.stringify(ids)}.map(id=>{const s=app.plugins.plugins['agent-note-terminal'].manager.sessions.get(id);return{id,native:s.record.native.sessionID,body:s.native.render(),live:s.live,saveError:s.saveError};}))`);
  for(let i=0;i<2;i++){assert.equal(after[i].body,before[i].body);assert.equal(after[i].native,before[i].native);assert.equal(after[i].live,false);assert.equal(after[i].saveError,'');}
  // Remove the preset, then explicitly continue from the historical launch snapshot.
  await ev(`(async()=>{const p=app.plugins.plugins['agent-note-terminal'],m=p.manager;m.data.settings.profiles=m.data.settings.profiles.filter(p=>p.id!==${JSON.stringify(profileID)});await m.persist();const s=m.sessions.get(${JSON.stringify(ids[0])});(await p.getView()).select(s);await m.launch(s);return true;})()`);
  await new Promise(r=>setTimeout(r,1500));
  await ev(`(async()=>{const s=app.plugins.plugins['agent-note-terminal'].manager.sessions.get(${JSON.stringify(ids[0])});s.write('TERMNOTE-继续原会话');await new Promise(r=>setTimeout(r,300));s.write(String.fromCharCode(13));return true;})()`);
  let resumed;
  for(let t=0;t<40;t++){resumed=await ev(`(()=>{const s=app.plugins.plugins['agent-note-terminal'].manager.sessions.get(${JSON.stringify(ids[0])});return JSON.stringify({native:s.record.native.sessionID,body:s.native.render(),error:s.error});})()`);if(resumed.body.includes('TERMNOTE-继续原会话')&&(resumed.body.match(/### Agent 回答/g)||[]).length>=2)break;await new Promise(r=>setTimeout(r,500));}
  assert.equal(resumed.native,before[0].native);assert.match(resumed.body,/TERMNOTE-继续原会话/);assert.equal((resumed.body.match(/TERMNOTE-0-中文对话/g)||[]).length,1);
  const report={ok:true,standardFilesOnly:true,version:'0.2.0',twoSessions:true,nativeTUI:true,unicode:true,reloadDedupe:true,deletedProfileResume:true,localModelRequests:calls,records,evidence:dir};
  await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
  await ev(`(async()=>{const p=app.plugins.plugins['agent-note-terminal'];for(const id of ${JSON.stringify(ids)}){const s=p?.manager.sessions.get(id);if(s)await s.stop();}if(p){p.data.settings.profiles=p.data.settings.profiles.filter(p=>p.id!==${JSON.stringify(profileID)});await p.manager.persist();}return true;})()`).catch(()=>{});
  await new Promise(r=>mock.close(r));
}

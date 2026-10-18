// Explicit integration test: isolated XDG state and a local deterministic model, no user credentials.
import {createServer} from 'node:http';import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {OpenCodeServer} from '../src/opencode';import {NativeArchive} from '../src/native';
import type {Profile} from '../src/types';
const dir=await mkdtemp(join(tmpdir(),'termnote-real-'));
for(const key of ['CONFIG','DATA','CACHE','STATE'])process.env[`XDG_${key}_HOME`]=join(dir,key.toLowerCase());
let calls=0;
const mock=createServer(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;
  const body=JSON.parse(text||'{}');calls++;
  const content='本地模型已回复：会话独立且持续记录。';
  const tool=body.tools?.find(t=>t.function?.name==='read'),useTool=tool&&JSON.stringify(body.messages).includes('TOOL_TEST')&&!body.messages.some(m=>m.role==='tool');
  const delta=useTool?{role:'assistant',tool_calls:[{index:0,id:'call_local_fixture',type:'function',function:{name:'read',arguments:JSON.stringify({[tool.function.parameters?.properties?.path?'path':'filePath']:join(dir,'fixture.txt')})}}]}:{role:'assistant',content};
  if(body.stream) {
    res.writeHead(200,{'content-type':'text/event-stream'});
    for(const data of [{id:'local',object:'chat.completion.chunk',choices:[{index:0,delta,finish_reason:null}]},{id:'local',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:useTool?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}])res.write('data: '+JSON.stringify(data)+'\n\n');
    res.end('data: [DONE]\n\n');
  }else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'local',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content},finish_reason:useTool?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));}
});
await new Promise<void>(r=>mock.listen(0,'127.0.0.1',r));const port=(mock.address() as any).port;
process.env.OPENCODE_CONFIG_CONTENT=JSON.stringify({model:'termnote/test',small_model:'termnote/test',provider:{termnote:{npm:'@ai-sdk/openai-compatible',name:'TermNote local test',options:{baseURL:`http://127.0.0.1:${port}/v1`,apiKey:'local-fixture'},models:{test:{name:'test',limit:{context:32000,output:2048}}}}}});
await writeFile(join(dir,'fixture.txt'),'TOOL_RESULT_中文文件内容');
const profile:Profile={id:'test',name:'OpenCode isolated',executable:process.env.TERMNOTE_OPENCODE||'opencode',adapter:'opencode',args:[],cwd:dir,model:'termnote/test'};
const host={bridge:resolve('bridge.py'),python:async()=>({executable:process.platform==='win32'?'python':'python3',prefix:[],description:'test'})};
const servers=[new OpenCodeServer(),new OpenCodeServer()];
try {
  const ids=[];
  for(const server of servers){await server.start(host,profile,dir);ids.push(await server.bind(profile));}
  assert.notEqual(ids[0].sessionID,ids[1].sessionID);
  for(let index=0;index<2;index++) {
    const server=servers[index],binding=ids[index];
    const args=server.terminalArgs(binding,profile);
    const command=spawn(server.executable,['run',...args,'--format','json',`只回答会话标记 TEST-${index}${index===0?' TOOL_TEST 请读取 fixture.txt':''}`],{cwd:dir,env:{...process.env,...server.environment},stdio:['ignore','pipe','pipe']});
    let output='',error='';command.stdout.on('data',c=>output+=c);command.stderr.on('data',c=>error+=c);
    const timeout=setTimeout(()=>command.kill('SIGTERM'),45000);const code=await new Promise(r=>command.once('close',r));clearTimeout(timeout);
    await writeFile(join(dir,`run-${index}.txt`),output+'\n'+error);
    assert.equal(code,0,`OpenCode run failed; isolated diagnostic: ${dir}`);
    const archive=new NativeArchive(join(dir,`native-${index}.json`));await archive.merge(binding,profile,dir,await server.export(binding));
    assert.match(archive.render(),new RegExp(`TEST-${index}`));assert.doesNotMatch(archive.render(),new RegExp(`TEST-${1-index}`));assert.match(archive.render(),/本地模型已回复/);if(index===0){assert.match(archive.render(),/工具执行/);assert.match(archive.render(),/TOOL_RESULT_中文文件内容/);}
  }
  const binding=ids[0];await servers[0].stop();const resumed=new OpenCodeServer();servers[0]=resumed;await resumed.start(host,profile,dir);assert.equal((await resumed.bind(profile,binding)).sessionID,binding.sessionID);
  const recovered=new NativeArchive(join(dir,'native-0.json'));await recovered.load(binding);const before=recovered.render();assert.equal(await recovered.merge(binding,profile,dir,await resumed.export(binding)),false);assert.equal(recovered.render(),before);
  console.log(JSON.stringify({ok:true,version:resumed.version,independentSessions:2,resume:true,archiveDedupe:true,localModelRequests:calls,evidence:dir}));
}finally{await Promise.allSettled(servers.map(s=>s.stop()));await new Promise<void>(r=>mock.close(()=>r()));}

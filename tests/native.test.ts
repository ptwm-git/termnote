import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {NativeArchive} from '../src/native';
import {validateOpenCodeArgs} from '../src/profiles';
import {region,patchNote} from '../src/note';
import type {NativeBinding,Profile} from '../src/types';
const binding:NativeBinding={kind:'opencode',api:'v2',version:'2.0.26',sessionID:'ses_test_A'};
const profile:Profile={id:'a',name:'OpenCode',adapter:'opencode',executable:'opencode',args:[],cwd:''};
test('原生消息更新、补齐与重复同步不重复；角色、工具及未知事件可读',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'termnote-native-')),path=join(dir,'session.json'),archive=new NativeArchive(path);
  try {
    const user={id:'msg_user1',type:'user',text:'中文提问 ```\n<!-- ant-session:bad -->'};
    const assistant={id:'msg_reply1',type:'assistant',model:{id:'test',providerID:'local'},content:[{type:'text',text:'回答第一部分'},{type:'tool',id:'call_1',name:'read',state:{status:'completed',content:[{type:'text',text:'工具结果'}]}}]};
    const data={info:{id:binding.sessionID},messages:[user,assistant]};
    assert.equal(await archive.merge(binding,profile,dir,data),true);
    assert.equal(await archive.merge(binding,profile,dir,data),false);
    await archive.merge(binding,profile,dir,{info:data.info,messages:[{...assistant,content:[{type:'text',text:'完整回答'},{type:'tool',id:'call_1',name:'read',state:{status:'completed',output:'最终工具输出'}}]}]});
    const body=archive.render();assert.equal((body.match(/### 用户输入/g)??[]).length,1);assert.equal((body.match(/### Agent 回答/g)??[]).length,1);assert.match(body,/完整回答/);assert.doesNotMatch(body,/回答第一部分/);assert.match(body,/最终工具输出/);
    const again=new NativeArchive(path);await again.load(binding);assert.equal(again.render(),body);
    const id='11111111-1111-1111-1111-111111111111',note=patchNote('# 人工正文\n',id,body,null);assert.ok(region(note,id));
    assert.match(await readFile(path,'utf8'),/msg_user1/);
    await assert.rejects(archive.merge(binding,profile,dir,{info:{id:'ses_other'},messages:[]}),/其他会话/);
    await assert.rejects(archive.merge(binding,profile,dir,{info:data.info,messages:[user,user]}),/重复/);
    assert.equal(archive.render(),body);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('原生快照写入失败不向内存确认、不改变已保存内容',async()=>{
  const archive=new NativeArchive(join(tmpdir(),'missing-'+Date.now(),'snapshot.json'));
  await assert.rejects(archive.merge(binding,profile,'/tmp',{info:{id:binding.sessionID},messages:[]}));
  assert.equal(archive.snapshot,undefined);
});
test('v1 消息/片段 ID、工具、错误和错配恢复均有保护',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'termnote-v1-')),path=join(dir,'snapshot.json');
  try{
    const archive=new NativeArchive(path),v1={...binding,api:'v1' as const};
    await archive.merge(v1,profile,dir,{info:{id:binding.sessionID},messages:[{info:{id:'msg_v1',sessionID:binding.sessionID,role:'assistant',modelID:'m',providerID:'p'},parts:[{id:'prt_a',type:'text',text:'不会重复'},{id:'prt_a',type:'text',text:'不会重复'}]}]});
    assert.equal((archive.render().match(/不会重复/g)??[]).length,1);
    await assert.rejects(new NativeArchive(path).load({...binding,sessionID:'ses_other'}),/不一致/);
    await assert.rejects(archive.merge(v1,profile,dir,{info:{id:binding.sessionID},messages:[{info:{id:'msg_wrong',sessionID:'ses_other'},parts:[]}]}),/其他会话/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('增强模式拒绝覆盖会话绑定的用户参数',()=>{
  for(const args of [['--continue'],['-c'],['--session=ses_other'],['--server','http://bad']])assert.throws(()=>validateOpenCodeArgs(args));
  assert.doesNotThrow(()=>validateOpenCodeArgs(['--log-level','warn']));
});

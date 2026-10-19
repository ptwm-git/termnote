import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,defaultShell} from '../src/settings';
import {SYSTEM_PROFILE_ID} from '../src/types';
import {setPalette} from '../src/appearance';
import {exportMarkdown} from '../src/export';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('新安装及升级均默认系统 Shell，保留旧 Agent 配置用于历史恢复',()=>{
  const old={python:'/custom/python',fontSize:14,defaultProfile:'oc',profiles:[{id:'oc',name:'旧配置',executable:'opencode',args:['--some-flag'],cwd:'/old/work',adapter:'opencode'}]};
  const before=JSON.stringify(old),migrated=normalizeSettings(old),fresh=normalizeSettings(null);
  for(const settings of [migrated,fresh]){
    assert.equal(settings.defaultProfile,SYSTEM_PROFILE_ID);
    const profile=settings.profiles.find(p=>p.id===settings.defaultProfile)!;
    assert.equal(profile.adapter,'terminal');assert.equal(profile.executable,'');assert.deepEqual(profile.args,[]);
    assert.equal(settings.fontSize,12);assert.equal(settings.recordFontSize,12);
  }
  assert.equal(migrated.python,old.python);assert.deepEqual(migrated.profiles.find(p=>p.id==='oc'),old.profiles[0]);assert.equal(JSON.stringify(old),before);
  migrated.profiles.find(p=>p.id===SYSTEM_PROFILE_ID)!.executable='/custom/zsh';migrated.fontSize=16;
  const reloaded=normalizeSettings(JSON.parse(JSON.stringify(migrated)));
  assert.equal(reloaded.profiles.find(p=>p.id===SYSTEM_PROFILE_ID)!.executable,'/custom/zsh');assert.equal(reloaded.fontSize,16);
  assert.match(defaultShell('win32',{SystemRoot:'C:\\Windows'}).executable,/WindowsPowerShell/);
  assert.equal(defaultShell('darwin',{SHELL:'/bin/zsh'}).executable,'/bin/zsh');
});

test('独立外观设置可重载，损坏值回退到可用配置',()=>{
  const settings=normalizeSettings(undefined);setPalette(settings,'terminal','light');setPalette(settings,'record','gray');
  settings.terminalForeground='#123456';settings.recordForeground='#fedcba';settings.recordRatio=0.7;settings.recordFontSize=11;
  const saved=normalizeSettings(JSON.parse(JSON.stringify(settings)));
  assert.equal(saved.terminalBackground,'#f7f7f7');assert.equal(saved.terminalForeground,'#123456');assert.equal(saved.recordBackground,'#2b2b2b');assert.equal(saved.recordForeground,'#fedcba');assert.equal(saved.recordRatio,0.7);assert.equal(saved.recordFontSize,11);
  const broken=normalizeSettings({fontSize:NaN,recordFontSize:999,recordRatio:Infinity,terminalBackground:'url(invalid)',recordForeground:'bad',profiles:[null]});
  assert.equal(broken.fontSize,12);assert.equal(broken.recordFontSize,20);assert.equal(broken.recordRatio,0.5);assert.equal(broken.terminalBackground,'#000000');assert.equal(broken.recordForeground,'');
});

test('Markdown 导出取消不读写；成功保存中文；同步失败保留已有目标',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'termnote-export-')),path=join(folder,'本地备份.md');let reads=0;
  try{
    await writeFile(path,'原文');
    assert.equal(await exportMarkdown('backup.md',async()=>{reads++;return '不应写入';},async()=>null),null);assert.equal(reads,0);assert.equal(await readFile(path,'utf8'),'原文');
    await assert.rejects(exportMarkdown('backup.md',async()=>{throw new Error('同步失败');},async()=>path),/同步失败/);assert.equal(await readFile(path,'utf8'),'原文');
    const text='# 终端备份\n\n用户输入和中文输出\n```sh\necho hello\n```\n';
    assert.equal(await exportMarkdown('backup.md',async()=>text,async()=>path),path);assert.equal(await readFile(path,'utf8'),text);assert.deepEqual(await readdir(folder),['本地备份.md']);
  }finally{await rm(folder,{recursive:true,force:true});}
});

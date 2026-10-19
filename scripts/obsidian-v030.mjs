// Destructive only to newly created fixtures in the named non-production test-vault.
// Requires a running Obsidian with its CLI and the current plugin installed.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const expected=resolve('../test-vault');
const run=(command,...args)=>execFileSync('obsidian',[command,'vault=test-vault',...args],{encoding:'utf8',timeout:60000,maxBuffer:2e6});
function evaluate(fn){
  const output=run('eval','code=(()=>{if(app.vault.adapter.getBasePath()!=='+JSON.stringify(expected)+')throw Error("Refusing non-test vault");return ('+fn.toString()+')();})()');
  if(!output.includes('=>'))throw new Error(output);
  return JSON.parse(output.slice(output.indexOf('=>')+2).trim());
}
const initial=evaluate(async()=>{
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const p=app.plugins.plugins['agent-note-terminal'];check(p?.manifest.version==='0.3.0','Install current build in test-vault first');
  const folder='TermNote-030-auto-'+Date.now();await app.vault.createFolder(folder);
  const original=['# 原文','中文与 Emoji 😀，不应被修改。'].join(String.fromCharCode(10));
  const source=await app.vault.create(folder+'/原文.md',original),central=app.workspace.getLeaf('tab');await central.openFile(source);await p.openFile(source);
  const view=await p.getView(),session=p.manager.sessions.get(view.getState().activeId);
  for(let i=0;i<150&&session.record.state!=='running';i++)await new Promise(r=>setTimeout(r,100));
  check(session.record.state==='running','Shell failed');check(!session.record.native,'New session bound to Agent');check(view.leaf.getRoot()===app.workspace.rightSplit,'View outside sidebar');check(central.view.file===source,'Source closed');check(session.record.path===folder+'/终端页面一.md','Backup path');
  await p.openFile(source);check(view.getState().activeId===session.record.id,'Duplicate running session');
  window.__termnoteV030Auto={folder,source:source.path,original,first:session.record.id,defaults:JSON.parse(JSON.stringify(p.data.settings))};
  view.panes.get(session.record.id).terminal.focus();
  return JSON.stringify({folder,version:p.manifest.version});
});
run('dev:cdp','method=Input.insertText','params='+JSON.stringify({text:'echo KEYBOARD_"中文验收"'}));
for(const type of ['keyDown','keyUp'])run('dev:cdp','method=Input.dispatchKeyEvent','params='+JSON.stringify({type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13}));
const result=evaluate(async()=>{
  const check=(v,m)=>{if(!v)throw new Error(m);},q=window.__termnoteV030Auto,p=app.plugins.plugins['agent-note-terminal'],v=await p.getView(),first=p.manager.sessions.get(q.first);
  const wait=async(fn)=>{for(let n=0;n<150;n++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Acceptance wait timed out');};
  await wait(async()=>(await p.manager.notes.read(first.record.path)).includes('KEYBOARD_中文验收'));
  v.newTab();await wait(()=>v.getState().activeId!==q.first);const second=p.manager.sessions.get(v.getState().activeId);await wait(()=>second.record.state==='running');second.write('echo SECOND_"独立保存"'+String.fromCharCode(13));await wait(async()=>(await p.manager.notes.read(second.record.path)).includes('SECOND_独立保存'));check(!(await p.manager.notes.read(first.record.path)).includes('SECOND_独立保存'),'Mixed output');
  try{
    Object.assign(p.data.settings,{terminalBackground:'#f7f7f7',terminalForeground:'#202020',recordBackground:'#2b2b2b',recordForeground:'#e5e5e5',fontSize:11,recordFontSize:13});p.manager.changed();await p.manager.persist();
    check(getComputedStyle(v.stages).backgroundColor==='rgb(247, 247, 247)','Terminal background');check(getComputedStyle(v.preview.parentElement).backgroundColor==='rgb(43, 43, 43)','Record background');check(getComputedStyle(v.preview).fontSize==='13px'&&v.panes.get(second.record.id).terminal.options.fontSize===11,'Independent fonts');
    await p.manager.rename(first,'自定义甲');await p.manager.rename(second,'自定义乙');const old=q.folder,moved=old+'-moved';await app.fileManager.renameFile(app.vault.getFolderByPath(old),moved);await wait(()=>p.data.counters[moved]===2&&first.record.sourcePath===moved+'/原文.md');check(!(old in p.data.counters),'Old counter not moved');
    q.folder=moved;q.source=moved+'/原文.md';let source=app.vault.getFileByPath(q.source);check(await app.vault.read(source)===q.original,'Source changed');await first.stop();await second.stop();await p.openFile(source);const third=p.manager.sessions.get(v.getState().activeId);await wait(()=>third.record.state==='running');check(third.record.path===moved+'/终端页面三.md','Counter reset');
    await app.fileManager.trashFile(source);await wait(()=>!third.record.sourcePath);source=await app.vault.create(q.source,'# 新文档');await p.openFile(source);const fourth=p.manager.sessions.get(v.getState().activeId);await wait(()=>fourth.record.state==='running');check(fourth!==third&&third.live,'Source deletion reuses or kills surviving terminal');check(fourth.record.path===moved+'/终端页面四.md','Recreated source backup');
    await app.vault.createFolder(moved+'/old-context');const previous=await app.vault.create(moved+'/old-context/previous.md','# previous');const empty=app.workspace.getLeaf('tab');await empty.openFile(previous);await empty.setViewState({type:'empty'});app.workspace.setActiveLeaf(empty);v.newTab();await wait(()=>v.getState().activeId!==fourth.record.id);const fifth=p.manager.sessions.get(v.getState().activeId);await wait(()=>fifth.record.state==='running');check(fifth.record.path===moved+'/终端页面五.md'&&!fifth.record.sourcePath,'Stale central context');
    v.leaf.detach();fifth.write('echo CLOSED_"后台保存"'+String.fromCharCode(13));await wait(async()=>(await p.manager.notes.read(fifth.record.path)).includes('CLOSED_后台保存'));const reopened=await p.getView();reopened.select(fifth);check(reopened.leaf.getRoot()===app.workspace.rightSplit,'Reopen outside sidebar');
    await Promise.all([third,fourth,fifth].map(s=>s.stop()));check([first,second,third,fourth,fifth].every(s=>!s.saveError&&!s.historyError),'Save failed');
    const visibility=p.data.records.map(record=>[record,record.visible]);
    try{
      for(const record of p.data.records)record.visible=record.id===fifth.record.id;reopened.select(fifth);
      await wait(()=>reopened.preview.innerText.includes('CLOSED_后台保存'));
      p.manager.hide(fifth);check(!reopened.getState().activeId,'Last tab was not hidden');reopened.select(fifth);
      await wait(()=>reopened.preview.innerText.includes('CLOSED_后台保存'));
    }finally{for(const [record,visible]of visibility)record.visible=visible;p.manager.changed();}
    return JSON.stringify({ok:true,keyboard:true,multipleTerminals:true,sourcePreserved:true,independentAppearance:true,folderCounter:true,recreatedSource:true,emptyContext:true,backgroundSave:true,readableAfterStop:true,lastTabReopen:true,folder:moved});
  }finally{
    p.data.settings=q.defaults;p.manager.changed();await Promise.all([...p.manager.sessions.values()].filter(s=>s.record.path.startsWith(q.folder+'/')).map(s=>s.stop()));await p.manager.persist();
  }
});
process.stdout.write(JSON.stringify({...initial,...result},null,2)+'\n');

// Real product verification in the isolated test vault. Never targets the formal vault.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
const exec=promisify(execFile),vault=resolve('../test-vault'),root=resolve('.');
async function ev(fn,...args){
 const code='(async()=>{if(app.vault.adapter.getBasePath()!=='+JSON.stringify(vault)+')throw Error("Refusing non-test vault");return await ('+fn.toString()+')(...'+JSON.stringify(args)+');})()';
 const {stdout}=await exec('obsidian',['eval','code='+code],{cwd:vault,timeout:60000,maxBuffer:2e6});
 if(!stdout.includes('=>')||/(^|\n)Error:/.test(stdout))throw Error(stdout);
 const result=JSON.parse(stdout.slice(stdout.indexOf('=>')+2).trim());console.log(JSON.stringify(result));return result;
}
const mode=process.argv[2]||'flow';
if(mode==='install')await ev(async root=>{
 const id='agent-note-terminal',p=app.plugins.plugins[id],fs=require('fs'),crypto=require('crypto'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');await p.manager.ready;
 if([...p.manager.sessions.values()].some(s=>s.live))throw Error('Test sessions must be stopped before installing');
 const before={ids:p.data.records.map(r=>r.id),files:{},settings:p.data.settings};for(const r of p.data.records)if(app.vault.getFileByPath(r.path))before.files[r.path]=hash(await p.manager.notes.read(r.path));
 fs.writeFileSync('/tmp/termnote-034-before.json',JSON.stringify(before),{mode:384});await p.closeSessions();await app.plugins.disablePlugin(id);
 const target=app.vault.adapter.getBasePath()+'/.obsidian/plugins/'+id;for(const name of ['main.js','manifest.json','styles.css'])fs.copyFileSync(root+'/'+name,target+'/'+name);
 await app.plugins.loadManifests();await app.plugins.enablePlugin(id);if(app.plugins.plugins[id].manifest.version!=='0.3.4')throw Error('Incorrect candidate');
 return JSON.stringify({installed:'0.3.4',oldRecords:before.ids.length,oldNotes:Object.keys(before.files).length});
},root);
else if(mode==='flow')await ev(async()=>{
 const p=app.plugins.plugins['agent-note-terminal'],m=p.manager,v=await p.getView(),fs=require('fs'),crypto=require('crypto'),hash=s=>crypto.createHash('sha256').update(s).digest('hex'),before=JSON.parse(fs.readFileSync('/tmp/termnote-034-before.json','utf8'));
 if(p.manifest.version!=='0.3.4')throw Error('Install candidate first');
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},wait=async fn=>{for(let i=0;i<220;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('QA condition timed out');},nl=String.fromCharCode(10),cr=String.fromCharCode(13);
 const folder='TermNote-034-同步验收-'+Date.now();await app.vault.createFolder(folder);const source=await app.vault.create(folder+'/来源原文.md','# 原文保留'),one=await m.newNote(folder,source.path),two=await m.newNote(folder,source.path);
 const screen=s=>{const t=s.transcript.terminal,b=t.buffer.active;let out='';for(let y=0;y<t.rows;y++)out+=b.getLine(b.baseY+y)?.translateToString(true)+nl;return out;};
 const button=()=>v.contentEl.querySelector('.ant-sync-button'),send=(s,text)=>{v.select(s);const t=v.panes.get(s.record.id).terminal;t.paste(text);t.input(cr,true);};
 const openRecovery=()=>{button().click();return [...v.contentEl.ownerDocument.querySelectorAll('.modal')].find(e=>e.querySelector('.modal-title')?.textContent==='备份并恢复笔记同步');};
 const click=(modal,label)=>{const b=[...modal.querySelectorAll('button')].find(e=>e.textContent===label);check(b,'Missing modal button '+label);b.click();};
 let first,second;
 try{
  v.select(one);await m.launch(one);await wait(()=>one.record.state==='running'&&!v.panes.get(one.record.id).loading);await wait(()=>fs.readFileSync(one.journal,'utf8').includes('[?2004h'));
  const runner=folder+'/fixture.py';await app.vault.create(runner,['for i in range(6):',' x=input("READY> ")',' print("REPLY:"+x,flush=True)'].join(nl));
  v.panes.get(one.record.id).terminal.input(String.fromCharCode(21),true);send(one,'python3 "'+m.base+'/'+runner+'"');await wait(()=>screen(one).includes('READY>'));
  check(button().textContent==='同步 ON','Default ON missing');check(v.contentEl.querySelector('.ant-toolbar button')===button(),'Sync not first action');
  send(one,'ON_034_A');await wait(async()=>(await m.notes.read(one.record.path)).includes('REPLY:ON_034_A'));
  button().click();await wait(()=>!one.syncEnabled&&!one.syncPending);const frozen=await m.notes.read(one.record.path);send(one,'OFF_PRIVATE_034');await wait(()=>screen(one).includes('REPLY:OFF_PRIVATE_034'));await new Promise(r=>setTimeout(r,650));await one.flush();check(await m.notes.read(one.record.path)===frozen,'OFF changed Markdown');check(!v.contentEl.querySelector('.ant-preview').innerText.includes('OFF_PRIVATE_034'),'OFF leaked to preview');
  v.select(two);check(button().textContent==='同步 ON','Other tab affected');await m.launch(two);await wait(()=>two.record.state==='running'&&!v.panes.get(two.record.id).loading);
  v.select(one);button().click();await wait(()=>one.syncEnabled&&!one.syncPending);send(one,'ON_034_B');await wait(async()=>(await m.notes.read(one.record.path)).includes('REPLY:ON_034_B'));check(!(await m.notes.read(one.record.path)).includes('OFF_PRIVATE_034'),'OFF backfilled after ON');
  await m.notes.update(one.record.path,t=>t.replace('REPLY:ON_034_A','用户需要保留的修改')+nl+'区域外正文'+nl);send(one,'ON_034_C');await wait(()=>!!one.saveError);check(button().textContent==='同步 OFF','Conflict must show OFF');const edited=await m.notes.read(one.record.path);
  let modal=openRecovery();check(modal,'Recovery modal absent');click(modal,'取消');check(await m.notes.read(one.record.path)===edited,'Cancel changed note');
  modal=openRecovery();click(modal,'备份并开启同步');await wait(()=>!one.saveError&&!v.contentEl.ownerDocument.querySelector('.modal-title')?.textContent.includes('备份并恢复'));
  const backup=app.vault.getMarkdownFiles().find(f=>f.path.startsWith(folder+'/')&&f.path.includes('同步恢复前备份'));check(backup,'Readable backup absent');check(await m.notes.read(backup.path)===edited,'Backup does not preserve original');check((await m.notes.read(one.record.path)).includes('区域外正文'),'Outside text lost');
  send(one,'ON_034_D');await wait(async()=>(await m.notes.read(one.record.path)).includes('REPLY:ON_034_D'));
  const file=app.vault.getFileByPath(one.record.path);first=app.workspace.getLeaf('tab');await first.openFile(file);second=app.workspace.getLeaf('split');await second.openFile(file);v.select(one);
  send(one,'ON_034_E');await wait(async()=>(await m.notes.read(one.record.path)).includes('REPLY:ON_034_E'));check(!one.saveError,'Multiple editors caused conflict');check(first.view.editor.getValue()===second.view.editor.getValue(),'Editors diverged');
  first.detach();second.detach();first=second=undefined;v.select(one);button().click();await wait(()=>!one.syncEnabled&&!one.syncPending);const stoppedText=await m.notes.read(one.record.path);await one.stop();check(await m.notes.read(one.record.path)===stoppedText,'OFF stop changed file');await two.stop();await m.persist();
  for(const [path,digest]of Object.entries(before.files))check(hash(await m.notes.read(path))===digest,'Old note changed '+path);check(before.ids.every(id=>p.data.records.some(r=>r.id===id)),'Old IDs lost');check(await m.notes.read(source.path)==='# 原文保留','Source changed');
  const image=await require('electron').remote.getCurrentWebContents().capturePage();fs.writeFileSync('/tmp/termnote-034-sync.png',image.toPNG());
  const result={ok:true,version:p.manifest.version,folder,fixture:one.record.id,other:two.record.id,defaultON:true,firstAction:true,OFFBytesUnchanged:true,noOFFBackfill:true,independentTabs:true,recoveryCancelPreserved:true,recoveryBackupExact:true,backup:backup.path,multipleEditors:true,OFFStopPreserved:true,oldNotesUnchanged:Object.keys(before.files).length,oldIdsPreserved:before.ids.length,live:[...m.sessions.values()].filter(s=>s.live).length};fs.writeFileSync('/tmp/termnote-034-ui-result.json',JSON.stringify(result),{mode:384});return JSON.stringify(result);
 }finally{first?.detach();second?.detach();await one.stop();await two.stop();}
});
else throw Error('Use install or flow');

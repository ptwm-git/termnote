import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const expected=resolve('../test-vault');
function run(command,...args){
  if(command==='eval')args=args.map(arg=>arg.startsWith('code=')?'code=(()=>{if(app.vault.adapter.getBasePath()!=='+JSON.stringify(expected)+')throw Error("Refusing non-test vault");return '+arg.slice(5)+';})()':arg);
  const result=spawnSync('obsidian',[command,'vault=test-vault',...args],{encoding:'utf8',timeout:20000});
  if(result.status!==0 || /^Error:/m.test(result.stdout))throw new Error(result.stdout+result.stderr);
  process.stdout.write(result.stdout);return result.stdout;
}
run('eval',`code=(async()=>{const p=app.plugins.plugins['agent-note-terminal'],v=await p.getView();document.querySelector('.ant-tab-row button[aria-label^="新建终端页面"]').click();await new Promise(r=>setTimeout(r,1000));document.querySelector('.ant-terminal:not(.ant-hidden) textarea').focus();return {active:v.getState(),focused:document.activeElement.className}})()`);
run('eval','code=app.vault.adapter.getBasePath() === '+JSON.stringify(expected)+' || (()=>{throw Error("Refusing non-test vault")})()');
run('dev:cdp','method=Input.insertText','params='+JSON.stringify({text:"printf 'KEYBOARD_中文输入测试\\n'"}));
run('dev:cdp','method=Input.dispatchKeyEvent','params='+JSON.stringify({type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}));
run('dev:cdp','method=Input.dispatchKeyEvent','params='+JSON.stringify({type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}));
run('eval',`code=(async()=>{await new Promise(r=>setTimeout(r,900));const p=app.plugins.plugins['agent-note-terminal'],v=await p.getView(),s=p.manager.sessions.get(v.getState().activeId);const text=await app.vault.read(app.vault.getAbstractFileByPath(s.record.path));if(!text.includes('KEYBOARD_中文输入测试')||!/(?:^|\\n)KEYBOARD_中文输入测试(?:\\r?\\n|$)/.test(await s.transcript.render()))throw Error('键盘命令未执行并保存');await s.stop();await p.manager.persist();return {ok:true,path:s.record.path,state:s.record.state,saveError:s.saveError}})()`);

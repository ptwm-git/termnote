import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Transcript} from '../src/transcript';
import {InputDraft} from '../src/input';
import type {BridgeEvent} from '../src/types';
const event=(action:'edit'|'submit'|'cancel',data?:string,echo?:string):BridgeEvent=>({type:'interaction',seq:1,time:'test',action,data,echo});
const count=(text:string,needle:string)=>text.split(needle).length-1;
async function submit(t:Transcript,text:string){await t.interaction(event('edit'));await t.feed(text);const visible=await t.visibleInput(text);assert.equal(visible.text,text);await t.interaction(event('submit',visible.text,visible.echo));}
test('普通行流式更新只保留最终内容，重复render无副作用',async()=>{
 const t=new Transcript();try{for(const chunk of ['答','回答','回答完毕']){await t.feed((chunk==='答'?'':'\r')+chunk);await t.render();}await t.feed('\r\n');const text=await t.render();assert.equal(count(text,'回答完毕'),1);assert.equal(count(text,'### 终端'),1);assert.equal(await t.render(),text);assert.ok(!text.includes('界面快照'));}finally{t.dispose();}
});
test('可见输入与输出分开，半成品和输入回显不重复',async()=>{
 const t=new Transcript();try{await t.feed('$ ');await t.interaction(event('edit'));await t.feed('ecxx\b\bho hello');assert.ok(!(await t.render()).includes('ecxx'));const v=await t.visibleInput('echo hello');assert.equal(v.text,'echo hello');await t.interaction(event('submit',v.text,v.echo));await t.feed('\r\nhello\r\n$ ');const text=await t.render();assert.equal(count(text,'echo hello'),1);assert.equal(count(text,'### 我'),1);assert.equal(count(text,'### 终端'),1);assert.match(text,/hello/);}finally{t.dispose();}
});
test('同轮TUI反复整屏重绘和字符流增长仅更新一个输出块',async()=>{
 const t=new Transcript(60,12);try{await t.feed('\x1b[?1049h');for(let i=1;i<=60;i++){await t.feed('\x1b[2J\x1b[H'+('完整回答：'+'文'.repeat(i)));await t.render();}const text=await t.render();assert.equal(count(text,'完整回答：'),1);assert.equal(count(text,'### 终端'),1);assert.ok(text.includes('文'.repeat(60)));}finally{t.dispose();}
});
test('菜单高亮不重复保存列表，确认与后续对话分段',async()=>{
 const t=new Transcript(60,15);try{await t.feed('\x1b[?1049h\x1b[H模型列表\r\n❯ 模型A\r\n  模型B');const before=await t.render();for(let i=0;i<10;i++)await t.feed('\x1b[H模型列表\r\n  模型A\r\n❯ 模型B');assert.equal(await t.render(),before);await t.interaction(event('edit'));await t.interaction({...event('submit','确认选择'),inputKind:'operation'});await t.feed('\x1b[2J\x1b[H已切换到模型B');const text=await t.render();assert.equal(count(text,'模型列表'),1);assert.equal(count(text,'模型A'),1);assert.equal(count(text,'### 操作'),1);assert.match(text,/已切换到模型B/);}finally{t.dispose();}
});
test('不同轮次相同问题和相同回答不会被全局去重',async()=>{
 const t=new Transcript();try{for(let i=0;i<2;i++){await t.feed('$ ');await submit(t,'echo 完成');await t.feed('\r\n完成\r\n');}const text=await t.render();assert.equal(count(text,'### 我'),2);assert.equal(count(text,'echo 完成'),2);assert.equal(count(text,'### 终端'),2);assert.equal(count(text,'\n完成\n'),2);}finally{t.dispose();}
});
test('普通输出的合法重复行和超长输出全部保留',async()=>{
 const t=new Transcript(80,5);try{await t.feed('OK\r\nOK\r\n'+Array.from({length:12050},(_,i)=>'LINE-'+i).join('\r\n')+'\r\n');const text=await t.render();assert.equal(count(text,'\nOK\n'),1);assert.match(text,/OK\nOK/);assert.match(text,/LINE-0\n/);assert.match(text,/LINE-12049/);}finally{t.dispose();}
});
test('软换行和超过滚动历史的单行正文不截断',async()=>{
 const t=new Transcript(10,3),line='BEGIN'+'x'.repeat(101000)+'END';try{await t.feed(line+'\r\n');assert.ok((await t.render()).includes(line));}finally{t.dispose();}
});
test('不回显密码和掩码不会成为持久输入，取消草稿不归档',async()=>{
 const t=new Transcript();try{await t.feed('Password: ');await t.interaction(event('edit'));assert.equal((await t.visibleInput('secret')).text,'');await t.feed('******');assert.equal((await t.visibleInput('word')).text,'');await t.interaction(event('submit'));await t.feed('\r\n$ ');await t.interaction(event('edit'));await t.feed('不要保存的草稿');await t.interaction(event('cancel'));assert.ok(!(await t.render()).includes('### 我'));assert.ok(!(await t.render()).includes('secret'));}finally{t.dispose();}
});
test('不同保存频率和重载重放产生相同内容',async()=>{
 const a=new Transcript(50,8),b=new Transcript(50,8);try{const chunks=['\x1b[?1049h\x1b[H回答一','\x1b[2J\x1b[H回答一增加','\x1b[H回答一增加\r\n新的一行','\x1b[?1049l退出\r\n'];for(const data of chunks){await a.feed(data);await a.render();await b.feed(data);}assert.equal(await a.render(),await b.render());}finally{a.dispose();b.dispose();}
});
test('编辑状态处理中文、退格、光标、历史与括号粘贴',()=>{
 const d=new InputDraft();for(const token of d.tokens('中文😀x\x7f\x1b[D好\x1b[C'))d.accept(token);assert.equal(d.text,'中文好😀');assert.equal(d.accept('\r'),'submit');d.reset();for(const token of d.tokens('\x1b[200~多行\n粘贴\x1b[201~'))assert.notEqual(d.accept(token),'submit');assert.equal(d.text,'多行\n粘贴');assert.equal(d.accept('\r'),'submit');d.reset();assert.equal(d.accept('\x1b[A'),'edit');assert.equal(d.unknown,true);assert.equal(d.accept('\x03'),'cancel');assert.equal(d.text,'');
});
test('百分号/金额/井号/比较符的普通输出保留',async()=>{
 const t=new Transcript();try{await t.feed('Progress: 100%\r\n2 > 1\r\nCost: $\r\nDone#\r\n');const text=await t.render();for(const value of ['Progress: 100%','2 > 1','Cost: $','Done#'])assert.ok(text.includes(value),text);}finally{t.dispose();}
});
test('编辑输入时的后台输出保留，草稿取消不归档',async()=>{
 const t=new Transcript();try{await t.feed('PROMPT> ');await t.interaction(event('edit'));await t.feed('draft\r\nBACKGROUND_OUTPUT\r\n');await t.interaction(event('cancel'));const text=await t.render();assert.match(text,/BACKGROUND_OUTPUT/);assert.doesNotMatch(text,/draft/);}finally{t.dispose();}
});
test('TUI相同文本回答与输入分开，含无清屏原位重绘',async()=>{
 for(const redraw of ['\x1b[2J\x1b[H','\x1b[H']){const t=new Transcript(40,6);try{await t.feed('\x1b[?1049h\x1b[H❯ ');await submit(t,'OK');await t.feed(redraw+'OK\x1b[K');const text=await t.render();assert.equal(count(text,'### 我'),1);assert.equal(count(text,'### 终端'),1,text);assert.equal(count(text,'\nOK\n'),2,text);}finally{t.dispose();}}
});
test('括号粘贴的多行可见输入完整提取',async()=>{
 const t=new Transcript(40,8);try{await t.feed('❯ ');await t.interaction(event('edit'));await t.feed('line one\r\nline two');const visible=await t.visibleInput('line one\nline two');assert.equal(visible.text,'line one\nline two');}finally{t.dispose();}
});
test('TUI整页滚动及同一chunk中的输出不丢失，插入段落有序',async()=>{
 const t=new Transcript(20,3);try{await t.feed('\x1b[?1049h\x1b[HLINE0\r\nLINE1\r\nLINE2');await t.feed('\r\nLINE3\r\nLINE4\r\nLINE5');const text=await t.render();for(let i=0;i<6;i++)assert.equal(count(text,'LINE'+i),1,text);assert.ok(text.indexOf('LINE2')<text.indexOf('LINE3'));}finally{t.dispose();}
 const u=new Transcript(40,8);try{await u.feed('\x1b[?1049h\x1b[Hparagraph A\r\nlast paragraph');await u.feed('\x1b[2J\x1b[Hparagraph A\r\ninserted paragraph B\r\nlast paragraph');const text=await u.render();assert.ok(text.indexOf('paragraph A')<text.indexOf('inserted paragraph B')&&text.indexOf('inserted paragraph B')<text.indexOf('last paragraph'),text);}finally{u.dispose();}
});
test('跨chunk的光标重绘控制序列按解析结果识别',async()=>{
 const t=new Transcript(40,6);try{for(const answer of ['Answer','Answer extended']){await t.feed('\x1b[');await t.feed('HTitle\r\n'+answer);}const text=await t.render();assert.equal(count(text,'Title'),1,text);assert.match(text,/Answer extended/);}finally{t.dispose();}
});
test('编辑多行草稿取消不进入正文，正常和全屏滚动一致',async()=>{
 for(const alternate of [false,true]){const t=new Transcript(40,3);try{await t.feed((alternate?'\x1b[?1049h\x1b[3;1H':'')+'❯ ');await t.interaction({...event('edit'),inputLines:3});await t.feed('line one\r\nline two\r\nline three');assert.equal((await t.visibleInput('line one\nline two\nline three')).text,'line one\nline two\nline three');assert.doesNotMatch(await t.render(),/line one|line two|line three/);await t.interaction(event('cancel'));assert.doesNotMatch(await t.render(),/line one|line two|line three/);}finally{t.dispose();}}
});
test('TUI清空历史后跨轮相同回答仍各保存一次',async()=>{
 const t=new Transcript(40,6);try{await t.feed('\x1b[?1049h\x1b[H❯ ');for(let i=0;i<2;i++){await submit(t,'same question');await t.feed('\x1b[2J\x1b[Hsame answer\r\n\r\n❯ ');}const text=await t.render();assert.equal(count(text,'same question'),2,text);assert.equal(count(text,'same answer'),2,text);}finally{t.dispose();}
});
test('TUI连续滚动相同行全部保留',async()=>{
 const t=new Transcript(20,3);try{await t.feed('\x1b[?1049h\x1b[H'+Array(7).fill('REPEATED').join('\r\n')+'\r\n');assert.equal(count(await t.render(),'REPEATED'),7,await t.render());}finally{t.dispose();}
});
test('常见spinner动画归一化且最终状态替换动画',async()=>{
 const t=new Transcript(40,6);try{await t.feed('\x1b[?1049h');for(const c of '⠋⠙⠹⠸⠼⠴')await t.feed('\x1b[H'+c+' Thinking…\x1b[K');assert.equal(count(await t.render(),'Thinking…'),1);await t.feed('\x1b[HFinished\x1b[K');assert.match(await t.render(),/Finished/);assert.doesNotMatch(await t.render(),/Thinking|[⠋⠙⠹⠸⠼⠴]/);}finally{t.dispose();}
});
test('带边框的TUI输入提取并消除历史回显',async()=>{
 const t=new Transcript(60,10);try{await t.feed('\x1b[?1049h\x1b[4;1H  ┃\r\n  ┃\r\n  ┃  ');await t.interaction(event('edit'));await t.feed('\x1b[5;1H  ┃  中文问题\x1b[6;5H');const v=await t.visibleInput('中文问题');assert.equal(v.text,'中文问题');await t.interaction(event('submit',v.text,v.echo));await t.feed('\x1b[2J\x1b[H  ┃\r\n  ┃  中文问题\r\n  ┃\r\n中文回答');const text=await t.render();assert.equal(count(text,'中文问题'),1,text);assert.match(text,/中文回答/);}finally{t.dispose();}
});
test('同步绘制事务跨chunk时不捕获半帧或拼接残影',async()=>{
 const t=new Transcript(40,8);try{await t.feed('\x1b[?1049h\x1b[H旧回答内容');await t.feed('\x1b[?2026h\x1b[HSearch');assert.doesNotMatch(await t.render(),/Search/);await t.feed('\x1b[K\r\nmodel A\x1b[K\x1b[?2026l');const text=await t.render();assert.match(text,/Search\nmodel A/);assert.doesNotMatch(text,/Search内容/);}finally{t.dispose();}
});
test('TUI当前输入行替换占位文字后仍能确认可见提交',async()=>{
 const t=new Transcript(40,8);try{await t.feed('\x1b[?1049h\x1b[HSearch');await t.interaction(event('edit'));await t.feed('\x1b[Htest2\x1b[K');assert.equal((await t.visibleInput('test2')).text,'test2');}finally{t.dispose();}
});
test('终端设备回复不污染用户编辑和导航状态',()=>{
 const d=new InputDraft();for(const value of ['\x1b[1;1R','\x1b[?1;2c','\x1b[>0;276;0c','\x1b]10;rgb:ffff/ffff/ffff\x07','\x1b[I'])for(const token of d.tokens(value))assert.equal(d.accept(token),'none');assert.equal(d.editing,false);assert.equal(d.navigation,false);assert.equal(d.text,'');for(const token of d.tokens('hello'))d.accept(token);assert.equal(d.navigation,false);assert.equal(d.text,'hello');
});
test('取消后终端回显Ctrl-C或清屏不会把草稿归档',async()=>{
 for(const full of [false,true]){const t=new Transcript(40,6);try{await t.feed((full?'\x1b[?1049h\x1b[H':'')+'❯ ');await t.interaction(event('edit'));await t.feed('CANCEL_DRAFT');await t.interaction(event('cancel'));await t.feed(full?'\x1b[2J\x1b[H❯ ':'^C\r\n❯ ');assert.doesNotMatch(await t.render(),/CANCEL_DRAFT/);}finally{t.dispose();}}
});
test('覆盖式及保留历史式TUI的跨轮相同回答均保留',async()=>{
 for(const history of [false,true]){const t=new Transcript(50,15);try{await t.feed('\x1b[?1049h\x1b[H❯ ');for(let i=0;i<2;i++){await submit(t,'same question');await t.feed('\x1b[?2026h\x1b[2J\x1b[H'+Array(history?i+1:1).fill('┃\r\n┃ same question\r\n┃\r\nsame answer\r\n').join('')+'\r\n❯ \x1b[?2026l');}const text=await t.render();assert.equal(count(text,'same question'),2,text);assert.equal(count(text,'same answer'),2,text);}finally{t.dispose();}}
});
test('新输入在屏幕底部时，滚出用户消息的旧回答不重新归档',async()=>{
 const t=new Transcript(50,15);try{await t.feed('\x1b[?1049h\x1b[H❯ ');await submit(t,'question one');await t.feed('\x1b[?2026h\x1b[2J\x1b[H┃ question one\r\nsame answer\r\n\r\n❯ \x1b[?2026l');await submit(t,'question two');await t.feed('\x1b[?2026h\x1b[2J\x1b[Hsame answer\r\n\r\n┃ question two\r\n❯ \x1b[?2026l');await t.feed('\x1b[?2026h\x1b[2J\x1b[H┃ question two\r\nsame answer\r\n\r\n❯ \x1b[?2026l');assert.equal(count(await t.render(),'same answer'),2,await t.render());}finally{t.dispose();}
});
test('非空输入的Ctrl-D不清空已编辑命令',async()=>{
 const d=new InputDraft(),t=new Transcript();try{await t.feed('$ ');await t.interaction(event('edit'));for(const token of d.tokens('echo he'))d.accept(token);await t.feed('echo he');assert.equal(d.accept('\x04'),'none');for(const token of d.tokens('llo'))d.accept(token);await t.feed('llo');const visible=await t.visibleInput(d.text,d.unknown);assert.equal(visible.text,'echo hello');await t.interaction(event('submit',visible.text,visible.echo));await t.feed('\r\nhello\r\n');assert.equal(count(await t.render(),'echo hello'),1);}finally{t.dispose();}
});
test('Ctrl-C后立即新输入时保留新提示符及完整命令边界',async()=>{
 const t=new Transcript();try{await t.feed('$ ');await t.interaction(event('edit'));await t.feed('CANCEL_DRAFT');await t.interaction(event('cancel'));await t.interaction(event('edit'));await t.feed('^C\r\n$ ');await t.feed('echo ok');const v=await t.visibleInput('echo ok');assert.equal(v.text,'echo ok');await t.interaction(event('submit',v.text,v.echo));await t.feed('\r\nok\r\n');assert.doesNotMatch(await t.render(),/CANCEL_DRAFT/);assert.match(await t.render(),/echo ok/);}finally{t.dispose();}
});
test('同文边框输入和回答保留回答，单独模糊边框行保守保留',async()=>{
 for(const answer of ['┃ OK\r\n┃ OK','┃ OK','┃ OK\r\nDetails']){const t=new Transcript(40,6);try{await t.feed('\x1b[?1049h\x1b[H❯ ');await submit(t,'OK');await t.feed('\x1b[2J\x1b[H'+answer);const text=await t.render();assert.equal(count(text,'### 我'),1);assert.equal(count(text,'### 终端'),1,text);assert.equal(text.split('\n').filter(line=>line==='OK').length,answer==='┃ OK\r\n┃ OK'?3:2,text);if(answer.includes('Details'))assert.match(text,/Details/);}finally{t.dispose();}}
});
test('ConPTY以光标重绘普通提示符时不重复归档输入',async()=>{
 const t=new Transcript(60,8);try{await t.feed('READY> ');await submit(t,'中文提问');await t.feed('\x1b[1;1HREADY> 中文提问\r\nANSWER:中文提问\r\n');const text=await t.render();assert.equal(count(text,'中文提问'),2,text);assert.match(text,/ANSWER:中文提问/);}finally{t.dispose();}
});
test('ConPTY在下一次隐藏输入后重绘历史仍排除已确认回显',async()=>{
 const t=new Transcript(60,8);try{await t.feed('READY> ');await submit(t,'中文提问');await t.feed('\x1b[1;1HREADY> 中文提问\r\nANSWER:中文提问\r\nPassword: ');await t.interaction(event('edit'));await t.interaction(event('submit',undefined,'Password: '));await t.feed('\x1b[1;1HREADY> 中文提问\r\nANSWER:中文提问\r\nPassword: \r\nFINISHED\r\n');const text=await t.render();assert.equal(count(text,'中文提问'),2,text);assert.match(text,/FINISHED/);}finally{t.dispose();}
});
test('多行输入的裸末行不得进入永久提示符回显集合',async()=>{
 const t=new Transcript(60,8);try{await t.feed('READY> ');await t.interaction({...event('edit'),inputLines:2});await t.feed('line one\r\nline two');const v=await t.visibleInput('line one\nline two');assert.equal(v.text,'line one\nline two');await t.interaction(event('submit',v.text,v.echo));await t.feed('\x1b[2J\x1b[Hline two\r\n');const text=await t.render();assert.equal(text.split('\n').filter(line=>line==='line two').length,2,text);assert.match(text,/### 终端/);}finally{t.dispose();}
});

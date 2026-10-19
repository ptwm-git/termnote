import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chineseNumber,fileName,validateName} from '../src/naming';
import {markers,region,patchNote,fence,binding,detachCopiedBinding,hash} from '../src/note';
import {LegacyTranscript as Transcript} from '../src/legacy-transcript';
import {NoteWriter} from '../src/writer';
const id='12345678-1234-1234-1234-123456789012';
test('递增中文命名和跨平台文件名',()=>{
  const expected:Record<number,string>={1:'一',10:'十',11:'十一',20:'二十',101:'一百零一',1001:'一千零一',9999:'九千九百九十九',10000:'10000'};
  for(const [n,value] of Object.entries(expected))assert.equal(chineseNumber(Number(n)),value);
  assert.equal(fileName(3),'终端页面三.md');assert.equal(validateName('新标题.md'),'新标题.md');
  for(const name of ['../非法','a/b','a:b','CON','com1.txt','末尾.',''])assert.throws(()=>validateName(name));
});
test('笔记更新保留前后正文、检测用户修改与区域删除',()=>{
  const first=patchNote('# 用户笔记\n内容',id,'初始输出',null);
  assert.equal(binding(first),id);const old=region(first,id)!.text;
  const next=patchNote(first+'\n用户追加',id,'第二次输出',old);
  assert.match(next,/# 用户笔记\n内容/);assert.match(next,/用户追加$/);assert.match(next,/第二次输出/);
  assert.throws(()=>patchNote(first.replace('初始输出','用户编辑'),id,'自动输出',old),/发生变化/);
  assert.throws(()=>patchNote('# 用户删除了记录',id,'自动输出',old));
  assert.throws(()=>region(first.replace(markers(id).end,''),id),/边界/);
});
test('代码围栏不会被 Agent 输出中的 Markdown 打断',()=>{
  const code='```js\nconsole.log("a")\n```\n````';assert.match(fence(code),/^`````text\n/);
  assert.ok(fence(code).includes(code));
});
test('复制笔记保留旧文字，但解除原会话控制标识',()=>{
  const first=patchNote('# 说明\n',id,'历史对话',null),copy=detachCopiedBinding(first,id);
  assert.equal(binding(copy),undefined);assert.equal(region(copy,id),null);assert.match(copy,/历史对话/);
});
test('保存器在关闭编辑器或重启后检查基线，失败不覆盖文本',async()=>{
  let text='# 正文\n';const access={read:async()=>text,update:async(_path:string,fn:(s:string)=>string)=>{text=fn(text);}};
  const writer=new NoteWriter(access,id,'A.md');const lastHash=await writer.save('one');
  text+='\n另一个编辑器追加的文字';await writer.save('two');assert.match(text,/另一个编辑器/);
  const restarted=new NoteWriter(access,id,'A.md',lastHash);await assert.rejects(restarted.init(),/上次保存后/);
  text=text.replace('two','手动改过的内容');await assert.rejects(writer.save('three'),/发生变化/);assert.match(text,/手动改过/);
  assert.notEqual(hash(text),lastHash);
});
test('ANSI 颜色、回车覆盖、中文和自动换行可读',async()=>{
  const t=new Transcript(12,5);
  try {
    await t.feed('\x1b[31m中文输出\x1b[0m\r\n');
    await t.feed('进度10%\r进度100%\r\n');
    await t.feed('abcdefghijklmnopqrstuvwx\r\n');
    const result=await t.render();assert.match(result,/中文输出/);assert.match(result,/进度100%/);assert.match(result,/abcdefghijklmnopqrstuvwx/);assert.ok(!result.includes('\x1b'));
  } finally {t.dispose();}
});
test('长输出不受 xterm 滚动历史上限限制',async()=>{
  const t=new Transcript(80,5);
  try {await t.feed(Array.from({length:12050},(_,i)=>`LINE-${i}`).join('\r\n')+'\r\n');const result=await t.render();assert.match(result,/LINE-0\n/);assert.match(result,/LINE-12049/);}
  finally{t.dispose();}
});
test('清屏与替代屏幕保留文字快照',async()=>{
  const t=new Transcript(40,8);
  try {await t.feed('原屏内容\x1b[2J\x1b[H');await t.feed('\x1b[?1049h\x1b[HAgent 菜单\r\n> 第一项');await t.render();await t.feed('\x1b[?1049l结束\r\n');const result=await t.render();assert.match(result,/原屏内容/);assert.match(result,/Agent 菜单/);assert.match(result,/第一项/);assert.match(result,/终端界面快照/);}
  finally{t.dispose();}
});
test('超长单行超过滚动缓冲仍保留前缀、完整正文及尾部',async()=>{
  const t=new Transcript(10,3),text='BEGIN'+'x'.repeat(101000)+'END';
  try {await t.feed(text+'\r\n');const result=await t.render();assert.ok(result.includes(text));}
  finally{t.dispose();}
});
test('cat 自己的笔记或输出控制标记不会破坏持续同步',async()=>{
  let text='# 我的笔记\n';const writer=new NoteWriter({read:async()=>text,update:async(_p,fn)=>{text=fn(text);}},id,'self.md');
  await writer.save('第一次记录');const printed=text;
  await writer.save(fence(printed));assert.ok(region(text,id));
  await writer.save(fence(printed)+'\n第二次记录');assert.match(text,/第二次记录/);
  assert.equal(binding(fence(markers(id).binding)+'\n普通正文'),undefined);
});
test('笔记比注册表更新时自动恢复，真实手改仍受保护',async()=>{
  let text='# 内容\n';const trusted=new Set<string>();
  const proof={has:(h:string)=>trusted.has(h),stage:(h:string)=>{trusted.add(h);}};
  const access={read:async()=>text,update:async(_p:string,fn:(s:string)=>string)=>{text=fn(text);}};
  const writer=new NoteWriter(access,id,'A.md',undefined,proof);
  const oldHash=await writer.save('旧记录');await writer.save('比注册表新的插件记录');
  const recovered=new NoteWriter(access,id,'A.md',oldHash,proof);await recovered.init();await recovered.save('正常恢复');
  text=text.replace('正常恢复','用户真正编辑的内容');
  await assert.rejects(new NoteWriter(access,id,'A.md',oldHash,proof).init(),/上次保存后/);
});

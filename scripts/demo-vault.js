(async()=>{
  const p=app.plugins.plugins['agent-note-terminal'],m=p.manager;
  const folder='Agent 终端示例';if(!app.vault.getFolderByPath(folder))await app.vault.createFolder(folder);
  for(const s of m.sessions.values())m.hide(s);
  const id='example-shell';
  if(!m.data.settings.profiles.some(p=>p.id===id))m.data.settings.profiles.push({id,name:'Shell 示例',executable:'/bin/sh',args:['-i'],cwd:''});
  const pages=[];
  for(let n=1;n<=3;n++){
    const s=await m.newNote(folder);s.record.profile=id;await m.launch(s,id);pages.push(s);
  }
  await new Promise(r=>setTimeout(r,400));
  const text=[
    '会话一 · 想法讨论\n\n每个标签对应一个真实笔记文件。\n点击 ＋ 可以新建同目录终端页面。\n在终端中输入自己的 Agent 命令即可开始。',
    '会话二 · 独立对话\n\n切换标签后，本页仍可继续运行和保存。\n重命名标签也会修改对应的笔记文件名。',
    '会话三 · 记录与查阅\n\n终端输出自动保存为 Markdown。\n原始日志单独保存，可以用于恢复。'
  ];
  for(let i=0;i<3;i++)pages[i].write("printf '\\033[2J\\033[H'; printf "+JSON.stringify(text[i].replace(/\n/g,'\\n')+'\\n')+'\r');
  await new Promise(r=>setTimeout(r,800));
  await Promise.all(pages.map(s=>s.stop()));await m.persist();
  const view=await p.getView();view.select(pages[0]);
  return {folder,notes:pages.map(s=>s.record.path),states:pages.map(s=>s.record.state),errors:pages.map(s=>s.saveError)};
})()

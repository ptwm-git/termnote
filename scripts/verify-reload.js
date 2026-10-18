(async()=>{
  const p=app.plugins.plugins['agent-note-terminal'],m=p.manager;
  const ensure=(ok,message)=>{if(!ok)throw Error(message);};
  const old=[...m.sessions.values()].find(s=>s.record.state==='missing' && s.record.path.endsWith('终端页面三.md'));
  ensure(old,'未找到删除的旧记录');
  const file=app.vault.getAbstractFileByPath(old.record.path);
  const fresh=await m.attach(file);ensure(fresh.record.id!==old.record.id,'重载后旧记录抢回新文件');
  const before=m.data.counters[old.record.path.slice(0,old.record.path.lastIndexOf('/'))];
  const view=await p.getView();view.select(fresh);
  document.querySelector('.ant-tab-row button[aria-label^="新建终端页面"]').click();
  await new Promise(r=>setTimeout(r,1200));
  const active=m.sessions.get(view.getState().activeId);
  ensure(active.record.id!==fresh.record.id && active.live,'点击新增标签未创建独立运行会话');
  ensure(active.record.path.includes('终端页面四.md') || before>=4,'重载后序号回退');
  active.write("printf 'UI_NEW_TAB_OK\\n'\r");await new Promise(r=>setTimeout(r,700));
  ensure((await app.vault.read(app.vault.getAbstractFileByPath(active.record.path))).includes('UI_NEW_TAB_OK'),'UI 新页未保存');
  await active.stop();await m.persist();
  return {ok:true,oldState:old.record.state,newId:fresh.record.id,newTab:active.record.path,saveErrors:[...m.sessions.values()].filter(s=>s.record.state!=='missing'&&s.saveError).map(s=>({path:s.record.path,error:s.saveError}))};
})()

import { FuzzySuggestModal,ItemView,Menu,Notice,Setting,Modal,TFile,TFolder,setIcon,MarkdownRenderer,Component,type WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { createReadStream,existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Manager } from './manager';
import type { Session } from './session';
import type { BridgeEvent,Profile } from './types';
import { STATE_LABEL } from './types';
import { parentPath } from './naming';
export const VIEW_TYPE='agent-note-terminal-view';
type Pane={element:HTMLElement;terminal:Terminal;fit:FitAddon;loading:boolean;pending:BridgeEvent[];seq:number};
export class FolderPicker extends FuzzySuggestModal<TFolder> {
  constructor(app:Manager['app'],private chosen:(folder:TFolder)=>void) {super(app);this.setPlaceholder('选择终端笔记所在文件夹');}
  getItems():TFolder[] {return this.app.vault.getAllFolders(true);}
  getItemText(item:TFolder):string {return item.path||'知识库根目录';}
  onChooseItem(item:TFolder):void {this.chosen(item);}
}
class SessionPicker extends FuzzySuggestModal<Session> {
  constructor(private manager:Manager,private chosen:(session:Session)=>void) {super(manager.app);this.setPlaceholder('重新打开已有终端页面（不会自动启动程序）');}
  getItems():Session[] {return [...this.manager.sessions.values()].filter(s=>s.record.state!=='missing');}
  getItemText(s:Session):string {return `${s.record.path} · ${STATE_LABEL[s.record.state]}${s.record.visible?' · 已打开':''}`;}
  onChooseItem(s:Session):void {this.chosen(s);}
}
class ProfilePicker extends FuzzySuggestModal<Profile> {
  constructor(private manager:Manager,private preferred:string,private chosen:(profile:Profile)=>void) {super(manager.app);this.setPlaceholder('为新终端笔记选择 Agent（回车使用首项）');}
  getItems():Profile[] {return [...this.manager.data.settings.profiles].sort((a,b)=>Number(b.id===this.preferred)-Number(a.id===this.preferred));}
  getItemText(p:Profile):string {return `${p.name} · ${p.adapter==='opencode'?'原生会话与角色记录':'通用终端记录'}`;}
  onChooseItem(p:Profile):void {this.chosen(p);}
}
class RenameModal extends Modal {
  constructor(private manager:Manager,private session:Session) {super(manager.app);}
  onOpen():void {
    this.titleEl.setText('重命名终端笔记');let value=this.session.record.path.split('/').pop()!.replace(/\.md$/,'');
    const error=this.contentEl.createDiv({cls:'ant-error'});
    new Setting(this.contentEl).setName('文件名').addText(input=>input.setValue(value).onChange(v=>value=v));
    new Setting(this.contentEl).addButton(button=>button.setButtonText('重命名').setCta().onClick(async()=>{
      try {await this.manager.rename(this.session,value);this.close();}catch(e){error.setText((e as Error).message);}
    }));
  }
}
export class TerminalView extends ItemView {
  private activeId='';
  private tabs!:HTMLElement;private toolbar!:HTMLElement;private stages!:HTMLElement;
  private status!:HTMLElement;private preview!:HTMLElement;private message!:HTMLElement;
  private panes=new Map<string,Pane>();private observer?:ResizeObserver;
  private toolbarKey='';private previewRevision='';private disposed=false;
  private previewComponent?:Component;private previewGeneration=0;
  constructor(leaf:WorkspaceLeaf,readonly manager:Manager) {super(leaf);}
  getViewType():string {return VIEW_TYPE;}
  getDisplayText():string {return '终端笔记';}
  getIcon():string {return 'terminal';}
  getState():Record<string,unknown> {return {activeId:this.activeId};}
  async setState(state:Record<string,unknown>):Promise<void> {this.activeId=typeof state.activeId==='string'?state.activeId:'';if(this.tabs)this.render();}
  private run(task:Promise<unknown>):void {void task.catch(error=>new Notice((error as Error).message,8000));}
  private button(parent:HTMLElement,icon:string,label:string,action:()=>void):HTMLButtonElement {
    const button=parent.createEl('button',{cls:'ant-icon-button',attr:{'aria-label':label,title:label}});setIcon(button,icon);button.addEventListener('click',action);return button;
  }
  async onOpen():Promise<void> {
    this.disposed=false;this.contentEl.empty();this.contentEl.addClass('ant-workbench');
    const tabRow=this.contentEl.createDiv({cls:'ant-tab-row'});
    this.tabs=tabRow.createDiv({cls:'ant-tabs',attr:{role:'tablist','aria-label':'终端会话标签'}});
    this.button(tabRow,'plus','新建终端页面（同目录独立文件）',()=>this.newTab());
    this.button(tabRow,'history','打开已有终端页面',()=>new SessionPicker(this.manager,s=>this.select(s)).open());
    this.toolbar=this.contentEl.createDiv({cls:'ant-toolbar'});
    this.status=this.contentEl.createDiv({cls:'ant-status',attr:{role:'status','aria-live':'polite'}});
    this.message=this.contentEl.createDiv({cls:'ant-message'});
    const split=this.contentEl.createDiv({cls:'ant-split'});
    this.stages=split.createDiv({cls:'ant-stages'});
    const record=split.createDiv({cls:'ant-record'});record.createEl('div',{text:'笔记记录 · 自动保存',cls:'ant-record-title'});
    this.preview=record.createDiv({cls:'ant-preview markdown-rendered'});
    const listener=(session?:Session,event?:BridgeEvent)=>{
      if(this.disposed)return;
      if(session && event) {
        const pane=this.panes.get(session.record.id);
        if(pane) {if(pane.loading)pane.pending.push(event);else this.apply(pane,event);}
      }
      this.render();
    };
    this.manager.listeners.add(listener);this.register(()=>this.manager.listeners.delete(listener));
    this.observer=new ResizeObserver(()=>this.fitActive());this.observer.observe(this.stages);
    this.render();
  }
  select(session:Session):void {
    this.manager.show(session);this.activeId=session.record.id;this.render();this.app.workspace.requestSaveLayout();
    requestAnimationFrame(()=>this.panes.get(session.record.id)?.terminal.focus());
  }
  private current():Session|undefined {return this.manager.sessions.get(this.activeId);}
  private apply(pane:Pane,event:BridgeEvent):void {
    if(event.seq<=pane.seq)return;
    pane.seq=event.seq;
    if(event.type==='output' && event.data) pane.terminal.write(event.data);
    if((event.type==='resize'||event.type==='start') && event.cols && event.rows) pane.terminal.resize(event.cols,event.rows);
  }
  private async createPane(session:Session):Promise<void> {
    if(this.panes.has(session.record.id))return;
    const element=this.stages.createDiv({cls:'ant-terminal'});
    const terminal=new Terminal({fontSize:this.manager.data.settings.fontSize,fontFamily:getComputedStyle(this.contentEl).getPropertyValue('--font-monospace').trim()||'monospace',cursorBlink:true,scrollback:10000,allowProposedApi:true,theme:{background:'#1e1e1e',foreground:'#dadada'}});
    const fit=new FitAddon();terminal.loadAddon(fit);terminal.open(element);
    const pane:Pane={element,terminal,fit,loading:true,pending:[],seq:0};this.panes.set(session.record.id,pane);
    terminal.onData(data=>{if(!pane.loading)session.write(data);});
    terminal.onBinary(data=>{if(!pane.loading)session.write(data);});
    terminal.attachCustomKeyEventHandler(event=>{
      const modifier=process.platform==='darwin'?event.metaKey:event.ctrlKey;
      if(event.type==='keydown' && modifier && event.key.toLowerCase()==='c' && terminal.hasSelection()) {this.run(navigator.clipboard.writeText(terminal.getSelection()));return false;}
      if(event.type==='keydown' && modifier && event.key.toLowerCase()==='v') {this.run(navigator.clipboard.readText().then(text=>terminal.paste(text)));return false;}
      return true;
    });
    try {
      if(existsSync(session.journal)) {
        const input=createReadStream(session.journal,{encoding:'utf8'}),lines=createInterface({input,crlfDelay:Infinity});
        try {for await(const line of lines) {
          if(this.disposed)break;
          let event:BridgeEvent;try {event=JSON.parse(line);}catch{break;}
          if(event.seq<=pane.seq)continue;
          pane.seq=event.seq;
          if(event.type==='output' && event.data) await new Promise<void>(resolve=>terminal.write(event.data!,resolve));
          else if((event.type==='resize'||event.type==='start') && event.cols && event.rows)terminal.resize(event.cols,event.rows);
        }} finally {lines.close();input.destroy();}
      }
      for(const event of pane.pending) this.apply(pane,event);
      await new Promise<void>(resolve=>terminal.write('',resolve));
    } catch(error) {new Notice('终端历史显示失败：'+(error as Error).message);}
    finally {pane.pending=[];pane.loading=false;if(!this.disposed)this.fitActive();}
  }
  private fitActive():void {
    const session=this.current(),pane=session&&this.panes.get(session.record.id);
    if(!pane || pane.element.offsetWidth<20 || pane.loading)return;
    try {pane.fit.fit();session!.resize(pane.terminal.cols,pane.terminal.rows);}catch{/* hidden window */}
  }
  private menu(session:Session,event:MouseEvent):void {
    const menu=new Menu();
    menu.addItem(item=>item.setTitle('重命名文件').setIcon('pencil').onClick(()=>new RenameModal(this.manager,session).open()));
    menu.addItem(item=>item.setTitle('打开对应笔记').setIcon('file-text').onClick(()=>this.openNote(session)));
    menu.addSeparator();
    menu.addItem(item=>item.setTitle('收起标签（后台继续保存）').setIcon('minus').onClick(()=>this.manager.hide(session)));
    menu.addItem(item=>item.setTitle('结束并关闭（保留笔记）').setIcon('square').onClick(()=>this.run(session.stop().then(()=>this.manager.hide(session)))));
    menu.showAtMouseEvent(event);
  }
  private openNote(session:Session):void {
    const file=this.app.vault.getAbstractFileByPath(session.record.path);
    if(file instanceof TFile)this.run(this.app.workspace.getLeaf('split').openFile(file));
  }
  newTab(folder?:string):void {
    const current=this.current();
    const create=async(target:string,profile:string)=>{
      const session=await this.manager.newNote(target);session.record.profile=profile;this.select(session);await this.manager.launch(session,profile);
    };
    const choose=(target:string)=>{
      const data=this.manager.data.settings,preferred=data.profiles.some(p=>p.id===current?.record.profile)?current!.record.profile:data.defaultProfile;
      if(data.profiles.length===1)this.run(create(target,data.profiles[0].id));
      else new ProfilePicker(this.manager,preferred,p=>this.run(create(target,p.id))).open();
    };
    const target=folder??(current?parentPath(current.record.path):undefined);
    if(target!==undefined)choose(target);
    else new FolderPicker(this.app,item=>choose(item.path)).open();
  }
  private render():void {
    if(!this.tabs||this.disposed)return;
    const visible=this.manager.data.records.filter(r=>r.visible && this.manager.sessions.has(r.id));
    if(!visible.some(r=>r.id===this.activeId)) this.activeId=visible[0]?.id??'';
    this.tabs.empty();
    for(const record of visible) {
      const session=this.manager.sessions.get(record.id)!;
      const tab=this.tabs.createDiv({cls:'ant-tab'+(this.activeId===record.id?' is-active':''),attr:{role:'tab','aria-selected':String(this.activeId===record.id),tabindex:'0',title:record.path}});
      tab.createSpan({text:record.path.split('/').pop()!.replace(/\.md$/,''),cls:'ant-tab-label'});
      tab.createSpan({cls:'ant-dot'+(session.live?' is-running':'')+(session.saveError?' is-error':''),attr:{title:session.saveError||STATE_LABEL[record.state]}});
      const close=this.button(tab,'x','收起标签，后台继续运行并保存',()=>this.manager.hide(session));close.addEventListener('click',e=>e.stopPropagation());
      tab.addEventListener('click',()=>{this.activeId=record.id;this.render();this.panes.get(record.id)?.terminal.focus();this.app.workspace.requestSaveLayout();});
      tab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.select(session);}});
      tab.addEventListener('contextmenu',e=>{e.preventDefault();this.menu(session,e);});
      tab.draggable=true;tab.addEventListener('dragstart',e=>e.dataTransfer?.setData('text/ant-session',record.id));
      tab.addEventListener('dragover',e=>e.preventDefault());tab.addEventListener('drop',e=>{e.preventDefault();this.manager.reorder(e.dataTransfer?.getData('text/ant-session')||'',record.id);});
      if(!this.panes.has(record.id))this.run(this.createPane(session));
    }
    for(const [id,pane] of this.panes) pane.element.toggleClass('ant-hidden',id!==this.activeId);
    const session=this.current();
    const key=[this.activeId,session?.record.state,session?.record.path,JSON.stringify(this.manager.data.settings.profiles),session?.saveError].join('|');
    if(this.toolbarKey!==key) {this.toolbarKey=key;this.renderToolbar(session);}
    if(!session) {this.status.setText('每个标签对应一个笔记文件和独立会话。点击 ＋ 新建更多终端页面。');this.message.setText('');this.preview.setText('会话的命令和可读输出将持续保存在对应笔记中。');return;}
    this.status.setText(`${STATE_LABEL[session.record.state]} · ${session.record.journalError?'原始日志故障，程序已停止：'+session.record.journalError:session.saveError?'笔记待同步：'+session.saveError:session.savedAt?'笔记已保存 '+session.savedAt:'等待保存'} · ${session.record.cwd||'工作目录：笔记所在文件夹'}`);
    this.status.toggleClass('ant-error',!!session.saveError||!!session.record.journalError);
    this.message.setText([session.error,session.nativeError&&'原生记录待同步：'+session.nativeError,session.record.native&&'当前笔记固定绑定此 OpenCode 会话。新对话请使用插件「＋」；原生 /new 或历史切换不会更改归档对象。'].filter(Boolean).join('\n'));this.message.toggleClass('ant-error',!!session.error||!!session.nativeError);
    const revision=this.activeId+':'+session.savedRevision+':'+session.record.state;
    if(revision!==this.previewRevision) {
      this.previewRevision=revision;const generation=++this.previewGeneration;
      void (async()=>{
        const body=await session.content(),target=document.createElement('div'),component=new Component();component.load();
        try {
          await MarkdownRenderer.render(this.app,body,target,session.record.path,component);
          if(this.current()===session&&!this.disposed && generation===this.previewGeneration) {
            const follow=this.preview.scrollHeight-this.preview.scrollTop-this.preview.clientHeight<32,top=this.preview.scrollTop;
            this.previewComponent?.unload();this.previewComponent=component;this.preview.replaceChildren(target);
            this.preview.scrollTop=follow?this.preview.scrollHeight:top;
          } else component.unload();
        } catch {component.unload();}
      })();
    }
    requestAnimationFrame(()=>this.fitActive());
  }
  private renderToolbar(session?:Session):void {
    this.toolbar.empty();
    if(!session) {
      this.toolbar.createEl('span',{text:'终端笔记',cls:'ant-title'});
      this.toolbar.createEl('button',{text:'使用当前笔记'}).addEventListener('click',()=>{
        const file=this.app.workspace.getActiveFile();
        if(file?.extension==='md')this.run(this.manager.attach(file).then(s=>{this.select(s);return this.manager.launch(s);}));
        else this.newTab();
      });
      this.toolbar.createEl('button',{text:'新建终端页面'}).addEventListener('click',()=>this.newTab());return;
    }
    this.toolbar.createEl('span',{text:session.record.path,cls:'ant-file',attr:{title:session.record.path}});
    const select=this.toolbar.createEl('select',{attr:{'aria-label':'启动配置'}});
    for(const profile of this.manager.data.settings.profiles)select.createEl('option',{text:profile.name,value:profile.id});
    if(!this.manager.data.settings.profiles.some(p=>p.id===session.record.profile))select.createEl('option',{text:(session.record.launch?.name??'原配置')+'（历史快照）',value:session.record.profile});
    select.value=session.record.profile;select.disabled=session.record.state==='starting';select.title='已有会话更换配置会创建新笔记';
    select.addEventListener('change',()=>{const profile=select.value;select.value=session.record.profile;this.run(this.manager.selectProfile(session,profile).then(next=>this.select(next)));});
    if(session.record.state==='idle'||session.record.state==='failed'||(!session.live&&session.record.native)) this.button(this.toolbar,'play',session.record.native?'继续此 OpenCode 会话':'启动当前配置',()=>this.run(this.manager.launch(session)));
    if(session.live)this.button(this.toolbar,'square','结束会话并保存',()=>this.run(session.stop()));
    if(session.record.native)this.button(this.toolbar,'download','从此 OpenCode 原生会话补齐记录',()=>this.run(session.refreshNative()));
    this.button(this.toolbar,'file-text','打开对应笔记',()=>this.openNote(session));
    this.button(this.toolbar,'pencil','重命名实际笔记文件',()=>new RenameModal(this.manager,session).open());
    this.button(this.toolbar,'folder-open','在文件管理器中显示原始日志',()=>{
      const electron=require('electron') as {shell:{showItemInFolder(path:string):void}};electron.shell.showItemInFolder(session.journal);
    });
    this.button(this.toolbar,'copy','复制可读记录',()=>this.run(session.body().then(text=>navigator.clipboard.writeText(text))));
    if(session.saveError)this.button(this.toolbar,'refresh-cw','备份当前笔记并恢复日志同步',()=>this.run(this.manager.repair(session)));
  }
  async onClose():Promise<void> {
    this.disposed=true;this.previewComponent?.unload();this.observer?.disconnect();for(const pane of this.panes.values())pane.terminal.dispose();this.panes.clear();
  }
}

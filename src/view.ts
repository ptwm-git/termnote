import { FuzzySuggestModal,ItemView,Menu,Notice,Setting,Modal,TFile,TFolder,setIcon,MarkdownRenderer,Component,type WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { createReadStream,existsSync,type ReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Manager } from './manager';
import type { Session } from './session';
import type { BridgeEvent } from './types';
import { STATE_LABEL,SYSTEM_PROFILE_ID } from './types';
import {applyAppearance} from './appearance';
import {ratio} from './settings';
import {currentFile} from './context';
import {exportMarkdown} from './export';
import { parentPath } from './naming';
export const VIEW_TYPE='agent-note-terminal-view';
type Pane={element:HTMLElement;terminal:Terminal;fit:FitAddon;loading:boolean;pending:BridgeEvent[];seq:number;cancelled:boolean;reader?:ReadStream;readClosed?:Promise<void>};
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
class CloseModal extends Modal {
  constructor(private manager:Manager,private session:Session,private dismissed:()=>void){super(manager.app);}
  onOpen():void {
    this.titleEl.setText('是否保存终端笔记？');
    this.contentEl.createEl('p',{text:this.session.record.path});
    this.contentEl.createEl('p',{text:'保存并退出会结束终端并保留全部记录；不保存会结束终端，并将自动生成的备份移入回收站。'});
    if(this.session.record.sharedArchive)this.contentEl.createEl('p',{text:'此继续副本与历史原件共享日志和原生归档。不保存会移除副本，但保留共享的历史归档。'});
    const error=this.contentEl.createDiv({cls:'ant-error'}),buttons:HTMLButtonElement[]=[];let busy=false;
    const finish=async(save:boolean)=>{
      if(busy)return;busy=true;buttons.forEach(button=>button.disabled=true);error.setText('正在结束终端…');
      try{const warning=await this.manager.closeSession(this.session,save);if(warning)new Notice(warning,10000);this.close();}
      catch(e){const message=(e as Error).message;error.setText(message);if(!this.contentEl.isConnected)new Notice(message,10000);busy=false;buttons.forEach(button=>button.disabled=false);}
    };
    const actions=new Setting(this.contentEl);
    actions.addButton(button=>{buttons.push(button.buttonEl);button.setButtonText('取消').onClick(()=>this.close());});
    if(this.manager.canDiscard(this.session))actions.addButton(button=>{buttons.push(button.buttonEl);button.setButtonText('不保存').setDestructive().onClick(()=>finish(false));});
    else this.contentEl.createEl('p',{text:'此历史文件无法确认是插件自动生成的备份，只提供保留选项；需要删除时请在文件列表中处理。'});
    actions.addButton(button=>{buttons.push(button.buttonEl);button.setButtonText('保存并退出').setCta().onClick(()=>finish(true));});
  }
  onClose():void {this.dismissed();}
}
export class TerminalView extends ItemView {
  private activeId='';
  private tabs!:HTMLElement;private toolbar!:HTMLElement;private stages!:HTMLElement;
  private status!:HTMLElement;private preview!:HTMLElement;private message!:HTMLElement;
  private panes=new Map<string,Pane>();private observer?:ResizeObserver;
  private toolbarKey='';private previewRevision='';private disposed=false;
  private split!:HTMLElement;private divider!:HTMLElement;private terminalTitle!:HTMLElement;private recordTitle!:HTMLElement;
  private appearanceKey='';private dragId:number|null=null;
  private previewComponent?:Component;private previewGeneration=0;
  private closeModals=new Map<string,CloseModal>();
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
    this.button(tabRow,'history','打开已有终端页面',()=>this.run(this.manager.ready.then(()=>{if(!this.manager.closed&&!this.disposed)new SessionPicker(this.manager,s=>this.select(s)).open();})));
    this.toolbar=this.contentEl.createDiv({cls:'ant-toolbar'});
    this.status=this.contentEl.createDiv({cls:'ant-status',attr:{role:'status','aria-live':'polite'}});
    this.message=this.contentEl.createDiv({cls:'ant-message'});
    this.split=this.contentEl.createDiv({cls:'ant-split'});
    const record=this.split.createDiv({cls:'ant-record'});
    this.recordTitle=record.createDiv({text:'增量对话 · 自动保存',cls:'ant-section-title'});
    this.preview=record.createDiv({cls:'ant-preview markdown-rendered'});
    this.divider=this.split.createDiv({cls:'ant-divider',attr:{role:'separator',tabindex:'0','aria-label':'调整备份与终端的高度','aria-orientation':'horizontal','aria-valuemin':'20','aria-valuemax':'80',title:'拖动调整上下比例；上下方向键微调'}});
    const terminalArea=this.split.createDiv({cls:'ant-terminal-area'});
    this.terminalTitle=terminalArea.createDiv({text:'系统终端',cls:'ant-section-title'});
    this.stages=terminalArea.createDiv({cls:'ant-stages'});
    this.bindDivider();
    this.registerEvent(this.app.workspace.on('css-change',()=>{this.appearanceKey='';this.render();}));
    const listener=(session?:Session,event?:BridgeEvent)=>{
      if(this.disposed)return;
      if(session && event) {
        const pane=this.panes.get(session.record.id);
        if(pane) {if(pane.loading)pane.pending.push(event);else this.apply(pane,event);}
      }
      this.render();
    };
    this.manager.listeners.add(listener);this.register(()=>this.manager.listeners.delete(listener));
    const close=(id:string)=>this.disposePane(id);this.manager.beforeClose.add(close);this.register(()=>this.manager.beforeClose.delete(close));
    this.observer=new ResizeObserver(()=>this.fitActive());this.observer.observe(this.stages);
    this.render();
  }
  private bindDivider():void {
    const change=(value:number)=>{
      this.manager.data.settings.recordRatio=ratio(value);applyAppearance(this.contentEl,this.manager.data.settings);
      this.divider.setAttribute('aria-valuenow',String(Math.round(this.manager.data.settings.recordRatio*100)));this.fitActive();
    };
    const finish=()=>{if(this.dragId===null)return;this.dragId=null;this.manager.changed();this.run(this.manager.persist());};
    this.registerDomEvent(this.divider,'pointerdown',event=>{
      if(event.button!==0)return;event.preventDefault();this.dragId=event.pointerId;this.divider.setPointerCapture(event.pointerId);
    });
    this.registerDomEvent(this.divider,'pointermove',event=>{
      if(event.pointerId!==this.dragId)return;
      const rect=this.split.getBoundingClientRect();if(rect.height)change((event.clientY-rect.top)/rect.height);
    });
    this.registerDomEvent(this.divider,'pointerup',finish);
    this.registerDomEvent(this.divider,'pointercancel',finish);
    this.registerDomEvent(this.divider,'lostpointercapture',finish);
    this.registerDomEvent(this.divider,'keydown',event=>{
      const current=this.manager.data.settings.recordRatio;
      const next=event.key==='ArrowUp'?current-0.05:event.key==='ArrowDown'?current+0.05:event.key==='Home'?0.2:event.key==='End'?0.8:null;
      if(next===null)return;event.preventDefault();change(next);this.manager.changed();this.run(this.manager.persist());
    });
  }
  private updateAppearance():void {
    const settings=this.manager.data.settings;applyAppearance(this.contentEl,settings);
    this.divider.setAttribute('aria-valuenow',String(Math.round(settings.recordRatio*100)));
    const style=getComputedStyle(this.stages),background=style.backgroundColor,foreground=style.color;
    const font=getComputedStyle(this.contentEl).getPropertyValue('--font-monospace').trim()||'monospace';
    const key=[settings.fontSize,font,background,foreground].join('|');
    if(this.appearanceKey===key)return;this.appearanceKey=key;
    for(const pane of this.panes.values()){
      pane.terminal.options.fontSize=settings.fontSize;
      pane.terminal.options.fontFamily=font;
      pane.terminal.options.theme={background,foreground,cursor:foreground};
    }
    this.fitActive();
  }
  select(session:Session):void {
    this.manager.show(session);this.activeId=session.record.id;this.render();this.app.workspace.requestSaveLayout();
    this.contentEl.ownerDocument.defaultView!.requestAnimationFrame(()=>this.panes.get(session.record.id)?.terminal.focus());
  }
  private current():Session|undefined {return this.manager.sessions.get(this.activeId);}
  private apply(pane:Pane,event:BridgeEvent):void {
    if(pane.cancelled||event.seq<=pane.seq)return;
    pane.seq=event.seq;
    if(event.type==='output' && event.data) pane.terminal.write(event.data);
    if((event.type==='resize'||event.type==='start') && event.cols && event.rows) pane.terminal.resize(event.cols,event.rows);
  }
  private async createPane(session:Session):Promise<void> {
    if(this.panes.has(session.record.id))return;
    const element=this.stages.createDiv({cls:'ant-terminal'});
    const style=getComputedStyle(this.stages);
    const terminal=new Terminal({fontSize:this.manager.data.settings.fontSize,lineHeight:1.3,fontFamily:getComputedStyle(this.contentEl).getPropertyValue('--font-monospace').trim()||'monospace',cursorBlink:true,scrollback:10000,allowProposedApi:true,theme:{background:style.backgroundColor,foreground:style.color,cursor:style.color}});
    const fit=new FitAddon();terminal.loadAddon(fit);terminal.open(element);
    const pane:Pane={element,terminal,fit,loading:true,pending:[],seq:0,cancelled:false};this.panes.set(session.record.id,pane);
    terminal.onData(data=>{if(!pane.loading&&!pane.cancelled&&!this.manager.isClosing(session))session.write(data);});
    terminal.onBinary(data=>{if(!pane.loading&&!pane.cancelled&&!this.manager.isClosing(session))session.write(data);});
    terminal.attachCustomKeyEventHandler(event=>{
      const modifier=process.platform==='darwin'?event.metaKey:event.ctrlKey;
      if(event.type==='keydown' && modifier && event.key.toLowerCase()==='c' && terminal.hasSelection()) {this.run(navigator.clipboard.writeText(terminal.getSelection()));return false;}
      // xterm handles the native paste event, including bracketed paste, exactly once.
      return true;
    });
    try {
      if(existsSync(session.journal)) {
        const input=createReadStream(session.journal,{encoding:'utf8'}),lines=createInterface({input,crlfDelay:Infinity});
        pane.reader=input;pane.readClosed=new Promise(resolve=>input.once('close',resolve));
        try {for await(const line of lines) {
          if(this.disposed||pane.cancelled)break;
          let event:BridgeEvent;try {event=JSON.parse(line);}catch{break;}
          if(event.seq<=pane.seq)continue;
          pane.seq=event.seq;
          if(event.type==='output' && event.data) await new Promise<void>(resolve=>terminal.write(event.data!,resolve));
          else if((event.type==='resize'||event.type==='start') && event.cols && event.rows)terminal.resize(event.cols,event.rows);
        }} finally {lines.close();input.destroy();}
      }
      if(pane.cancelled)return;
      for(const event of pane.pending) this.apply(pane,event);
      await new Promise<void>(resolve=>terminal.write('',resolve));
    } catch(error) {if(!pane.cancelled)new Notice('终端历史显示失败：'+(error as Error).message);}
    finally {pane.pending=[];pane.loading=false;if(!this.disposed&&!pane.cancelled)this.fitActive();}
  }
  private async disposePane(id:string):Promise<void>{
    const pane=this.panes.get(id);if(!pane)return;pane.cancelled=true;pane.reader?.destroy();await pane.readClosed;
    pane.terminal.dispose();pane.element.remove();if(this.panes.get(id)===pane)this.panes.delete(id);
  }
  private requestClose(session:Session):void{
    if(this.closeModals.has(session.record.id)||this.manager.isClosing(session))return;
    const modal=new CloseModal(this.manager,session,()=>this.closeModals.delete(session.record.id));this.closeModals.set(session.record.id,modal);modal.open();
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
    menu.addItem(item=>item.setTitle('关闭标签…').setIcon('x').onClick(()=>this.requestClose(session)));
    menu.showAtMouseEvent(event);
  }
  private openNote(session:Session):void {
    const file=this.app.vault.getAbstractFileByPath(session.record.path);
    if(file instanceof TFile)this.run(this.app.workspace.getLeaf('tab').openFile(file));
  }
  newTab(folder?:string):void {
    this.run(this.manager.ready.then(()=>{if(this.disposed)return;if(this.manager.closed)throw new Error('插件正在关闭');this.newTabReady(folder);}));
  }
  private newTabReady(folder?:string):void {
    const file=currentFile(this.app),current=this.current();
    const create=async(target:string)=>{
      const session=await this.manager.newNote(target,file?.path);this.select(session);await this.manager.launch(session);
    };
    const target=folder??(file?parentPath(file.path):current?parentPath(current.record.path):undefined);
    if(target!==undefined)this.run(create(target));else new FolderPicker(this.app,item=>this.run(create(item.path))).open();
  }
  private render():void {
    if(!this.tabs||this.disposed)return;
    this.updateAppearance();
    if(!this.manager.loaded){this.status.setText('正在恢复终端笔记…');return;}
    const visible=this.manager.data.records.filter(r=>r.visible && this.manager.sessions.has(r.id));
    if(!visible.some(r=>r.id===this.activeId)) this.activeId=visible[0]?.id??'';
    this.tabs.empty();
    for(const record of visible) {
      const session=this.manager.sessions.get(record.id)!;
      const tab=this.tabs.createDiv({cls:'ant-tab'+(this.activeId===record.id?' is-active':''),attr:{role:'tab','aria-selected':String(this.activeId===record.id),tabindex:'0',title:record.path}});
      tab.createSpan({text:record.path.split('/').pop()!.replace(/\.md$/,''),cls:'ant-tab-label'});
      tab.createSpan({cls:'ant-dot'+(session.live?' is-running':'')+(session.saveError?' is-error':''),attr:{title:session.saveError||STATE_LABEL[record.state]}});
      const close=this.button(tab,'x','关闭标签：选择保存或不保存',()=>this.requestClose(session));close.addEventListener('click',e=>e.stopPropagation());
      tab.addEventListener('click',()=>{this.activeId=record.id;this.render();this.panes.get(record.id)?.terminal.focus();this.app.workspace.requestSaveLayout();});
      tab.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.select(session);}});
      tab.addEventListener('contextmenu',e=>{e.preventDefault();this.menu(session,e);});
      tab.draggable=true;tab.addEventListener('dragstart',e=>e.dataTransfer?.setData('text/ant-session',record.id));
      tab.addEventListener('dragover',e=>e.preventDefault());tab.addEventListener('drop',e=>{e.preventDefault();this.manager.reorder(e.dataTransfer?.getData('text/ant-session')||'',record.id);});

    }
    for(const [id,pane] of this.panes) pane.element.toggleClass('ant-hidden',id!==this.activeId);
    const session=this.current();
    this.recordTitle.setText(!session||session.record.transcriptVersion===2?'增量对话 · 自动保存':'历史记录 · 原文保留');
    if(session&&!this.manager.isClosing(session)&&!this.panes.has(session.record.id))this.run(this.createPane(session));
    for(const id of this.panes.keys())if(!this.manager.sessions.has(id))this.run(this.disposePane(id));
    for(const [id,pane]of this.panes)pane.element.toggleClass('ant-hidden',id!==this.activeId);
    this.terminalTitle.setText(session?.record.native?'历史终端（主动恢复后继续）':'系统终端 · 直接输入本机 CLI 命令');
    const key=[this.activeId,session?.record.state,session?.record.path,session?.saveError,session?.record.native?.sessionID].join('|');
    if(this.toolbarKey!==key) {this.toolbarKey=key;this.renderToolbar(session);}
    if(!session) {
      this.previewRevision='';this.previewGeneration++;this.previewComponent?.unload();this.previewComponent=undefined;
      this.status.setText('每个标签是独立系统终端与备份文件。点击 ＋ 在当前文件夹新建。');this.message.setText('');this.preview.setText('终端可见内容将自动保存在同目录的新笔记中，当前文档保持原样。');return;
    }
    this.status.setText(`${STATE_LABEL[session.record.state]} · ${session.record.journalError?'原始日志故障，程序已停止：'+session.record.journalError:session.saveError?'笔记待同步：'+session.saveError:session.savedAt?'备份已保存 '+session.savedAt:'等待保存'} · ${session.record.cwd||'工作目录：笔记所在文件夹'}`);
    this.status.toggleClass('ant-error',!!session.saveError||!!session.record.journalError);
    this.message.setText([session.error,session.nativeError&&'原生记录待同步：'+session.nativeError,session.record.native&&'当前笔记固定绑定此 OpenCode 会话。新对话请使用插件「＋」；原生 /new 或历史切换不会更改归档对象。'].filter(Boolean).join('\n'));this.message.toggleClass('ant-error',!!session.error||!!session.nativeError);
    const revision=this.activeId+':'+session.savedRevision+':'+session.record.state;
    if(revision!==this.previewRevision) {
      this.previewRevision=revision;const generation=++this.previewGeneration;
      void (async()=>{
        const body=await session.content(),target=createDiv(),component=new Component();component.load();
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
    this.contentEl.ownerDocument.defaultView!.requestAnimationFrame(()=>this.fitActive());
  }
  private renderToolbar(session?:Session):void {
    this.toolbar.empty();
    if(!session){
      this.toolbar.createSpan({text:'系统终端',cls:'ant-title'});
      this.toolbar.createEl('button',{text:'新建备份'}).addEventListener('click',()=>this.newTab());return;
    }
    this.toolbar.createSpan({text:session.record.path.split('/').pop()!,cls:'ant-file',attr:{title:session.record.path}});
    if((session.record.state==='idle'||session.record.state==='failed')&&session.record.profile===SYSTEM_PROFILE_ID&&!session.record.native)this.button(this.toolbar,'play','启动系统终端',()=>this.run(this.manager.launch(session)));
    if(session.live)this.button(this.toolbar,'square','结束终端并保存备份',()=>this.run(session.stop()));
    this.button(this.toolbar,'file-text','在中央打开备份笔记',()=>this.openNote(session));
    this.button(this.toolbar,'pencil','重命名备份文件',()=>new RenameModal(this.manager,session).open());
    this.button(this.toolbar,'save','导出 Markdown 到本地',()=>this.run(exportMarkdown(session.record.path,()=>this.manager.exportContent(session)).then(path=>{if(path)new Notice('已导出备份：'+path);})));
    this.button(this.toolbar,'copy','复制已保存备份',()=>this.run(this.manager.exportContent(session).then(text=>navigator.clipboard.writeText(text))));
    const more=this.button(this.toolbar,'more-horizontal','更多操作',()=>{
      const menu=new Menu();
      menu.addItem(item=>item.setTitle('在文件管理器中显示原始日志').setIcon('folder-open').onClick(()=>{
        const electron=require('electron') as {shell:{showItemInFolder(path:string):void}};electron.shell.showItemInFolder(session.journal);
      }));
      if(session.record.transcriptVersion!==2)menu.addItem(item=>item.setTitle('生成精简记录副本').setIcon('file-plus').onClick(()=>this.run(this.manager.compactCopy(session).then(file=>this.app.workspace.getLeaf('tab').openFile(file)))));
      if(session.record.native){
        if(!session.live)menu.addItem(item=>item.setTitle('继续历史 OpenCode 会话').setIcon('play').onClick(()=>this.run(this.manager.launch(session))));
        menu.addItem(item=>item.setTitle('补齐历史原生记录').setIcon('download').onClick(()=>this.run(this.manager.refreshNative(session))));
      }
      if(session.saveError)menu.addItem(item=>item.setTitle('备份当前文件并恢复同步').setIcon('refresh-cw').onClick(()=>this.run(this.manager.repair(session))));
      menu.showAtPosition({x:more.getBoundingClientRect().left,y:more.getBoundingClientRect().bottom});
    });
  }
  async onClose():Promise<void> {
    this.disposed=true;this.previewComponent?.unload();this.observer?.disconnect();for(const modal of this.closeModals.values())modal.close();await Promise.all([...this.panes.keys()].map(id=>this.disposePane(id)));
  }
}

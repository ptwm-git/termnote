import {Plugin,PluginSettingTab,Setting,Notice,TFile,TFolder,FileSystemAdapter} from 'obsidian';
import {SYSTEM_PROFILE_ID,type PluginData,type Settings} from './types';
import {normalizeSettings} from './settings';
import {Manager} from './manager';
import {TerminalView,VIEW_TYPE,FolderPicker} from './view';
import {currentFile} from './context';
import {PALETTES,paletteName,setPalette,type Area,type Palette} from './appearance';

export default class AgentNoteTerminal extends Plugin {
  data!:PluginData;manager!:Manager;
  private shutdown?:Promise<void>;private opening?:Promise<TerminalView>;
  private ready:Promise<void>=Promise.resolve();private loading?:Promise<void>;private finishReady:()=>void=()=>{};private unloading=false;
  async onload():Promise<void> {
    const stored=await this.loadData() as Partial<PluginData>|null;
    this.data={settings:normalizeSettings(stored?.settings),records:Array.isArray(stored?.records)?stored.records:[],counters:stored?.counters??{}};
    if(!(this.app.vault.adapter instanceof FileSystemAdapter)){new Notice('TermNote · 终端笔记只支持本地桌面知识库');return;}
    this.manager=new Manager(this.app,this.data,this.manifest.dir!,()=>this.saveData(this.data));
    let resolveReady!:()=>void,rejectReady!:(error:unknown)=>void;
    this.ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});this.finishReady=resolveReady;void this.ready.catch(this.report);
    this.manager.ready=this.ready;
    this.registerView(VIEW_TYPE,leaf=>new TerminalView(leaf,this.manager));
    this.addRibbonIcon('terminal','打开终端笔记',()=>{void this.openCurrent().catch(this.report);});
    this.addCommand({id:'open-current-note',name:'在当前文件右侧打开终端',callback:()=>{void this.openCurrent().catch(this.report);}});
    this.addCommand({id:'new-terminal-note',name:'新建终端备份',callback:()=>{void this.getView().then(view=>view.newTab()).catch(this.report);}});
    this.addCommand({id:'show-sessions',name:'打开右侧终端工作台',callback:()=>{void this.getView().catch(this.report);}});
    this.addCommand({id:'stop-all',name:'结束所有终端会话并保存',callback:()=>{void this.ready.then(()=>Promise.all([...this.manager.sessions.values()].map(s=>s.stop()))).then(()=>{
      const failed=[...this.manager.sessions.values()].filter(s=>s.saveError||s.record.journalError);
      new Notice(failed.length?`会话已结束，${failed.length} 篇笔记仍待同步；请在对应标签恢复记录`:'所有会话已结束，记录已保存',8000);
    }).catch(this.report);}});
    this.registerEvent(this.app.workspace.on('file-menu',(menu,file)=>{
      if(file instanceof TFile)menu.addItem(item=>item.setTitle('在右侧终端打开并备份').setIcon('terminal').onClick(()=>{void this.openFile(file).catch(this.report);}));
      if(file instanceof TFolder)menu.addItem(item=>item.setTitle('在此文件夹新建终端备份').setIcon('terminal').onClick(()=>{void this.getView().then(view=>view.newTab(file.path)).catch(this.report);}));
    }));
    this.registerEvent(this.app.vault.on('rename',(file,old)=>{if(this.manager.closed)return;void (this.manager.loaded?this.ready.then(()=>this.manager.renamed(file,old)):this.manager.renamed(file,old)).catch(this.report);}));
    this.registerEvent(this.app.vault.on('delete',file=>{const path=file.path;void this.ready.then(()=>this.manager.closed?undefined:this.manager.deleted(path)).catch(this.report);}));
    this.registerEvent(this.app.workspace.on('quit',tasks=>{tasks.addPromise(this.closeSessions());}));
    this.app.workspace.onLayoutReady(()=>{
      if(this.manager.closed){resolveReady();return;}
      this.loading=this.manager.load().then(()=>this.manager.persist());
      void this.loading.then(()=>{
        resolveReady();
        if(!this.unloading&&this.app.workspace.getLeavesOfType(VIEW_TYPE).some(leaf=>leaf.getRoot()!==this.app.workspace.rightSplit))void this.getView().catch(this.report);
      },rejectReady);
    });
    this.addSettingTab(new TerminalSettings(this));
    // Initial onload must return so Obsidian can finish restoring its workspace.
    if(this.app.workspace.layoutReady)await this.ready;
  }
  private report=(error:unknown):void=>{console.error('[TermNote]',error);new Notice(error instanceof Error?error.message:String(error),10000);};
  getView():Promise<TerminalView> {
    return this.ready.then(()=>this.opening??=(this.openSidebar().finally(()=>{this.opening=undefined;})));
  }
  private async openSidebar():Promise<TerminalView> {
    if(this.manager.closed)throw new Error('插件正在关闭');
    const workspace=this.app.workspace,leaves=workspace.getLeavesOfType(VIEW_TYPE);
    let leaf=leaves.find(item=>item.getRoot()===workspace.rightSplit);
    if(!leaf){
      const state=leaves[0]?.getViewState().state;
      leaf=workspace.getRightLeaf(false)??undefined;
      if(!leaf)throw new Error('无法创建右侧终端面板');
      await leaf.setViewState({type:VIEW_TYPE,active:true,state});
    }
    await workspace.revealLeaf(leaf);
    if(!(leaf.view instanceof TerminalView))throw new Error('右侧终端视图未能加载');
    // Move old editor-area workbenches only when opening/migrating the view.
    for(const previous of leaves)if(previous!==leaf)previous.detach();
    workspace.requestSaveLayout();return leaf.view;
  }
  async openFile(file:TFile):Promise<void> {
    await this.ready;
    const session=await this.manager.openFromFile(file),view=await this.getView();view.select(session);
    if(session.record.state==='idle'&&session.record.profile===SYSTEM_PROFILE_ID&&!session.record.native)await this.manager.launch(session);
  }
  async openCurrent():Promise<void> {
    const file=currentFile(this.app);
    if(file)await this.openFile(file);
    else{const view=await this.getView();new FolderPicker(this.app,folder=>view.newTab(folder.path)).open();}
  }
  private closeSessions():Promise<void>{return this.shutdown??=(async()=>{
    this.unloading=true;this.manager.closed=true;
    if(!this.loading)this.finishReady();else await this.loading.catch(()=>{});
    await this.manager.shutdown();
  })();}
  onunload():void{if(this.manager)void this.closeSessions().catch(this.report);}
}

class TerminalSettings extends PluginSettingTab {
  constructor(private plugin:AgentNoteTerminal){super(plugin.app,plugin);}
  private async save():Promise<void>{this.plugin.manager.changed();await this.plugin.manager.persist();}
  display():void {
    const {containerEl}=this;containerEl.empty();containerEl.addClass('ant-settings');const data=this.plugin.data.settings;
    new Setting(containerEl).setName('运行环境').setHeading();
    new Setting(containerEl).setName('Python 解释器路径').setDesc('留空自动检测 Python 3.9+。Windows 还需要在同一个解释器安装 pywinpty。').addText(input=>input.setPlaceholder(process.platform==='win32'?'C:\\Python313\\python.exe':'/opt/homebrew/bin/python3').setValue(data.python).onChange(async value=>{data.python=value;this.plugin.manager.resetPython();await this.save();}));
    const result=containerEl.createDiv();
    new Setting(containerEl).setName('检查终端环境').addButton(button=>button.setButtonText('检测').onClick(async()=>{
      button.setDisabled(true);result.setText('检测中…');
      try{this.plugin.manager.resetPython();result.setText((await this.plugin.manager.python()).description);}
      catch(error){result.setText((error as Error).message);}finally{button.setDisabled(false);}
    }));
    new Setting(containerEl).setName('系统终端').setHeading();
    containerEl.createEl('p',{text:'新标签直接运行系统 Shell。在终端输入 opencode、claude、codex 等已安装命令即可；账户与模型由对应 CLI 管理。'});
    const shell=data.profiles.find(p=>p.id===SYSTEM_PROFILE_ID)!;
    new Setting(containerEl).setName('Shell 程序（可选）').setDesc('留空：macOS 使用登录 Shell，Windows 使用 PowerShell。只填写路径，不在此填写参数。').addText(input=>input.setValue(shell.executable).setPlaceholder('使用系统默认 Shell').onChange(async value=>{shell.executable=value.trim();await this.save();}));
    const argsError=containerEl.createDiv({cls:'ant-error'});
    new Setting(containerEl).setName('Shell 参数（JSON 数组）').setDesc('空数组使用默认参数；自定义程序时按该 Shell 的命令格式填写。').addTextArea(input=>input.setValue(JSON.stringify(shell.args)).setPlaceholder('[]').onChange(async value=>{
      try{const args:unknown=JSON.parse(value);if(!Array.isArray(args)||!args.every((item):item is string=>typeof item==='string'))throw new Error();shell.args=args;argsError.setText('');await this.save();}
      catch{argsError.setText('参数须为字符串数组，例如 ["-l"]。');}
    }));
    new Setting(containerEl).setName('工作目录（可选）').setDesc('留空使用当前备份所在的文件夹；也可填写绝对路径。').addText(input=>input.setValue(shell.cwd).onChange(async value=>{shell.cwd=value.trim();await this.save();}));
    this.appearance(data,'terminal');this.appearance(data,'record');
    containerEl.createEl('p',{text:'拖动右侧栏左边界可调宽度；拖动备份和终端之间的分隔条可调上下比例。每个标签对应独立备份。关闭单个标签可选择保存、不保存或取消；收起整个面板仍在后台保存。'});
    containerEl.createEl('p',{text:'记录保存在同目录的 Markdown 及知识库 .agent-note-terminal 日志中，可通过「导出 Markdown」另存到本地。终端可见输出持续备份，不另存密码等不回显按键。'});
  }
  private appearance(data:Settings,area:Area):void {
    const {containerEl}=this,terminal=area==='terminal';
    new Setting(containerEl).setName(terminal?'终端外观':'备份外观').setHeading();
    new Setting(containerEl).setName('字号').addSlider(slider=>slider.setLimits(10,terminal?24:20,1).setValue(terminal?data.fontSize:data.recordFontSize).onChange(async value=>{if(terminal)data.fontSize=value;else data.recordFontSize=value;await this.save();}));
    new Setting(containerEl).setName('配色预设').setDesc(terminal?'默认黑底浅字；终端内的 ANSI 彩色输出仍由 CLI 控制。':'默认跟随 Obsidian；与终端配色独立。').addDropdown(drop=>{
      for(const [key,preset]of Object.entries(PALETTES))drop.addOption(key,preset.name);
      drop.addOption('custom','自定义').setValue(paletteName(data,area)).onChange(async value=>{if(value!=='custom'){setPalette(data,area,value as Palette);await this.save();this.update();}});
    });
    const bg=terminal?'terminalBackground':'recordBackground',fg=terminal?'terminalForeground':'recordForeground';
    new Setting(containerEl).setName('背景颜色').setDesc('选色即自定义；使用预设可恢复跟随主题。').addColorPicker(picker=>picker.setValue(data[bg]||(document.body.hasClass('theme-dark')?'#202020':'#ffffff')).onChange(async value=>{data[bg]=value;await this.save();}));
    new Setting(containerEl).setName('字体颜色').addColorPicker(picker=>picker.setValue(data[fg]||(document.body.hasClass('theme-dark')?'#e5e5e5':'#202020')).onChange(async value=>{data[fg]=value;await this.save();}));
  }
}

import { Plugin,PluginSettingTab,Setting,Notice,TFile,TFolder,FileSystemAdapter } from 'obsidian';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS,type PluginData } from './types';
import { Manager } from './manager';
import { TerminalView,VIEW_TYPE,FolderPicker } from './view';
import {PRESETS,detectProfile} from './profiles';
export default class AgentNoteTerminal extends Plugin {
  data!:PluginData;manager!:Manager;
  private shutdown?:Promise<void>;
  async onload():Promise<void> {
    const stored=await this.loadData();
    this.data={settings:{...structuredClone(DEFAULT_SETTINGS),...(stored?.settings??{})},records:Array.isArray(stored?.records)?stored.records:[],counters:stored?.counters??{}};
    if(!Array.isArray(this.data.settings.profiles)||!this.data.settings.profiles.length)this.data.settings.profiles=structuredClone(DEFAULT_SETTINGS.profiles);
    if(!(this.app.vault.adapter instanceof FileSystemAdapter)) {new Notice('TermNote · 终端笔记只支持本地桌面知识库');return;}
    this.manager=new Manager(this.app,this.data,this.manifest.dir!,()=>this.saveData(this.data));
    await this.manager.load();
    this.registerView(VIEW_TYPE,leaf=>new TerminalView(leaf,this.manager));
    this.addRibbonIcon('terminal','打开终端笔记',()=>{void this.openCurrent().catch(this.report);});
    this.addCommand({id:'open-current-note',name:'在当前笔记打开终端',callback:()=>{void this.openCurrent().catch(this.report);}});
    this.addCommand({id:'new-terminal-note',name:'新建终端页面',callback:()=>{void this.getView().then(view=>view.newTab()).catch(this.report);}});
    this.addCommand({id:'show-sessions',name:'打开终端会话工作台',callback:()=>{void this.getView().catch(this.report);}});
    this.addCommand({id:'stop-all',name:'结束所有终端会话并保存',callback:()=>{void Promise.all([...this.manager.sessions.values()].map(s=>s.stop())).then(()=>{
      const failed=[...this.manager.sessions.values()].filter(s=>s.saveError||s.record.journalError);
      new Notice(failed.length?`会话已结束，${failed.length} 篇笔记仍待同步；请在对应标签恢复记录`:'所有会话已结束，记录已保存',8000);
    }).catch(this.report);}});
    this.registerEvent(this.app.workspace.on('file-menu',(menu,file)=>{
      if(file instanceof TFile && file.extension==='md')menu.addItem(item=>item.setTitle('在终端笔记中打开').setIcon('terminal').onClick(()=>{void this.openFile(file).catch(this.report);}));
      if(file instanceof TFolder)menu.addItem(item=>item.setTitle('在此文件夹新建终端页面').setIcon('terminal').onClick(()=>{void this.getView().then(view=>view.newTab(file.path)).catch(this.report);}));
    }));
    this.registerEvent(this.app.vault.on('rename',(file,old)=>{
      if(file instanceof TFile)void this.manager.renamed(file,old).catch(this.report);
      if(file instanceof TFolder) for(const session of this.manager.sessions.values()) if(session.record.path.startsWith(old+'/')) {
        const next=this.app.vault.getAbstractFileByPath(file.path+session.record.path.slice(old.length));
        if(next instanceof TFile)void this.manager.renamed(next,session.record.path).catch(this.report);
      }
    }));
    this.registerEvent(this.app.vault.on('delete',file=>{void this.manager.deleted(file.path).catch(this.report);}));
    this.registerEvent(this.app.workspace.on('quit',tasks=>{tasks.addPromise(this.closeSessions());}));
    this.addSettingTab(new TerminalSettings(this));
  }
  private report=(error:unknown):void=>{console.error('[TermNote]',error);new Notice(error instanceof Error?error.message:String(error),10000);};
  async getView():Promise<TerminalView> {
    let leaf=this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if(!leaf) {leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW_TYPE,active:true});}
    await this.app.workspace.revealLeaf(leaf);return leaf.view as TerminalView;
  }
  async openFile(file:TFile):Promise<void> {
    const session=await this.manager.attach(file),view=await this.getView();view.select(session);
    // Only a newly created, explicit command starts a process; history opens read-only.
    if(session.record.state==='idle')await this.manager.launch(session);
  }
  async openCurrent():Promise<void> {
    const file=this.app.workspace.getActiveFile();
    if(file?.extension==='md')await this.openFile(file);
    else {const view=await this.getView();new FolderPicker(this.app,folder=>view.newTab(folder.path)).open();}
  }
  private closeSessions():Promise<void> {return this.shutdown??=this.manager.shutdown();}
  onunload():void {if(this.manager)void this.closeSessions().catch(this.report);}
}
class TerminalSettings extends PluginSettingTab {
  constructor(private plugin:AgentNoteTerminal) {super(plugin.app,plugin);}
  display():void {
    const {containerEl}=this;containerEl.empty();containerEl.addClass('ant-settings');const data=this.plugin.data.settings;
    new Setting(containerEl).setName('运行环境').setHeading();
    containerEl.createEl('p',{text:'每个标签是一篇真实笔记。程序使用本机安装和登录状态；插件持续归档终端显示的文字，不猜测用户/Agent 角色。'});
    new Setting(containerEl).setName('Python 解释器路径').setDesc('留空自动检测 Python 3.9+。Windows 还需要在同一个解释器安装 pywinpty。').addText(input=>input.setPlaceholder(process.platform==='win32'?'C:\\Python313\\python.exe':'/opt/homebrew/bin/python3').setValue(data.python).onChange(async value=>{data.python=value;this.plugin.manager.resetPython();await this.plugin.manager.persist();}));
    const result=containerEl.createDiv();
    new Setting(containerEl).setName('检查终端运行环境').addButton(button=>button.setButtonText('检测').onClick(async()=>{
      button.setDisabled(true);result.setText('检测中…');
      try {this.plugin.manager.resetPython();result.setText((await this.plugin.manager.python()).description);}
      catch(error){result.setText((error as Error).message);}finally{button.setDisabled(false);}
    }));
    new Setting(containerEl).setName('终端字号').addSlider(slider=>slider.setLimits(10,24,1).setValue(data.fontSize).setDynamicTooltip().onChange(async value=>{data.fontSize=value;await this.plugin.manager.persist();}));
    new Setting(containerEl).setName('默认启动配置').addDropdown(drop=>{
      for(const p of data.profiles)drop.addOption(p.id,p.name);drop.setValue(data.defaultProfile).onChange(async value=>{data.defaultProfile=value;await this.plugin.manager.persist();});
    });
    new Setting(containerEl).setName('启动配置').setHeading();
    containerEl.createEl('p',{text:'系统终端留空程序路径即可。Agent 可填写完整可执行文件路径，参数使用 JSON 数组；也可以先启动系统终端，再手动输入任意 Agent 命令。'});
    for(const profile of data.profiles) {
      const box=containerEl.createDiv({cls:'ant-profile'});
      new Setting(box).setName('配置名称').addText(input=>input.setValue(profile.name).onChange(async value=>{profile.name=value;await this.plugin.manager.persist();}));
      new Setting(box).setName('记录方式').setDesc('OpenCode 增强模式支持独立原生会话、继续对话与角色记录。其他程序使用通用终端。').addDropdown(drop=>drop.addOption('terminal','通用终端').addOption('opencode','OpenCode 增强').setValue(profile.adapter??'terminal').onChange(async value=>{profile.adapter=value as 'terminal'|'opencode';await this.plugin.manager.persist();this.display();}));
      new Setting(box).setName('可执行文件').setDesc('程序名或完整路径，不在此填写参数。').addText(input=>input.setValue(profile.executable).onChange(async value=>{profile.executable=value.trim();await this.plugin.manager.persist();}));
      const version=box.createDiv({cls:'ant-muted'});
      new Setting(box).setName('检测 Agent 版本').setDesc('只执行该程序的 --version，不读取对话或发送模型请求。').addButton(button=>button.setButtonText('检测').onClick(async()=>{
        button.setDisabled(true);version.setText('检测中…');
        try {const result=await detectProfile(profile);version.setText(`${result.version} · ${result.executable}${result.api?' · OpenCode '+result.api+' 增强接口':' · 通用终端记录'}`);}
        catch(error){version.setText((error as Error).message);}finally{button.setDisabled(false);}
      }));
      if(profile.adapter==='opencode')new Setting(box).setName('模型（可选）').setDesc('OpenCode 2.x 支持 provider/model；留空使用原生配置。凭据仍在 OpenCode 中设置。1.x 请在原生界面选择模型。').addText(input=>input.setValue(profile.model??'').setPlaceholder('provider/model').onChange(async value=>{profile.model=value.trim();await this.plugin.manager.persist();}));
      const error=box.createDiv({cls:'ant-error'});
      new Setting(box).setName('参数（JSON 数组）').addTextArea(input=>input.setValue(JSON.stringify(profile.args)).setPlaceholder('["--flag", "带空格的参数"]').onChange(async value=>{
        try {const args:unknown=JSON.parse(value);if(!Array.isArray(args)||args.some(x=>typeof x!=='string'))throw new Error();profile.args=args;error.setText('');await this.plugin.manager.persist();}
        catch {error.setText('参数须为字符串数组，例如 ["--help"]。');}
      }));
      new Setting(box).setName('工作目录').setDesc('留空使用对应笔记文件夹；自定义时填写绝对路径。').addText(input=>input.setValue(profile.cwd).onChange(async value=>{profile.cwd=value.trim();await this.plugin.manager.persist();}));
      if(data.profiles.length>1)new Setting(box).addButton(button=>button.setButtonText('删除配置').onClick(async()=>{data.profiles=data.profiles.filter(p=>p.id!==profile.id);if(data.defaultProfile===profile.id)data.defaultProfile=data.profiles[0].id;await this.plugin.manager.persist();this.display();}));
    }
    let preset='opencode';
    new Setting(containerEl).setName('添加 Agent 配置').addDropdown(drop=>{
      for(const [id,value]of Object.entries(PRESETS))drop.addOption(id,value.name);drop.setValue(preset).onChange(value=>preset=value);
    }).addButton(button=>button.setButtonText('添加').onClick(async()=>{data.profiles.push({id:randomUUID(),...structuredClone(PRESETS[preset])});await this.plugin.manager.persist();this.display();}));
    containerEl.createEl('p',{text:'修改或删除配置不会修改已经启动的会话。为已有会话选择不同配置会创建同目录新笔记；OpenCode 的历史会话按启动快照继续。'});
    containerEl.createEl('p',{text:'关闭标签只收起界面，后台继续保存。请用“结束会话”停止程序。正常退出 Obsidian 会结束会话；重新打开历史笔记不会自动执行命令。原始日志在知识库 .agent-note-terminal 文件夹。'});
  }
}

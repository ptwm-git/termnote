# TermNote

TermNote is a desktop Obsidian plugin with a terminal in the right sidebar: a continuously saved record above, an interactive system shell below. Every terminal tab has its own Markdown backup. Your original document stays open in the editor and is not modified. Saved notes remain readable after the terminal closes or the plugin is removed.

## Features

- Start a system shell and type any installed CLI, including OpenCode, Claude Code or Codex. No agent is selected or required by default.
- Use independent terminal tabs. Backups are created beside the current document with numbered names that fill the smallest available gap; you can rename them.
- Resize the native sidebar horizontally and drag the internal divider to adjust the record/terminal heights.
- Configure each area's font size, background and text color independently. Presets include black, gray, light and the Obsidian theme.
- Save an incremental conversation: submitted visible input as **我** (me), output as **终端** (terminal), and menu confirmations as **操作** (action). Streaming text updates its current block; screen repainting does not append whole-screen snapshots.
- Keep the raw output event log for recovery. Export readable Markdown using the native **Save As** dialog. Older notes remain intact; **生成精简记录副本** creates a separate compact copy beside the original.
- Preserve older records and explicitly resume previously bound OpenCode sessions. New sessions always use the system shell.

## Installation and use

Requires **Obsidian 1.14.4+ on macOS or Windows** and **Python 3.9+**. Windows also needs `pywinpty` in the same interpreter: `python -m pip install pywinpty`. Install and authenticate your CLI tools separately. Mobile is not supported.

Install **TermNote** from its [Obsidian Community page](https://community.obsidian.md/plugins/agent-note-terminal), use [BRAT](https://github.com/TfTHacker/obsidian42-brat) with `ptwm-git/termnote`, or extract the ZIP from [GitHub Releases](https://github.com/ptwm-git/termnote/releases/latest) into your vault's `.obsidian/plugins/`. Enable **TermNote** and check the Python environment in its settings. Only the standard `main.js`, `manifest.json` and `styles.css` runtime files are required; the Python bridge is embedded.

Open a document and click the terminal ribbon icon, or run **TermNote: 在当前文件右侧打开终端**. A new backup is created in the same folder. Type commands in the lower terminal; the upper record saves automatically. **+** starts another independent terminal and backup. **×** asks whether to save and stop, discard and stop, or cancel. Discard moves the generated backup to the configured trash and removes its session logs. Archives shared with an older original are retained. The tab menu also offers **收起标签（后台继续保存）** to keep working in the background; closing the whole sidebar keeps saving. Use the history button to reopen saved records, and the save button to export Markdown.

The interface currently uses Chinese labels. [Release status](docs/RELEASE.md) and [validation](docs/VALIDATION.md) report actual review and platform coverage. macOS Obsidian is tested; Windows ConPTY and CLI protocol tests run in CI. The Windows Obsidian graphical interface still needs manual testing.

## Local access, network and records

The plugin launches programs with your user permissions. Commands can read and write files outside the vault. A local export writes to the location you select. The plugin does not install dependencies, collect telemetry or read agent authentication files. Agents manage their own credentials, model connections and provider charges. Explicitly resuming an old enhanced OpenCode session starts an authenticated service bound only to `127.0.0.1`; ordinary new shell sessions do not start that service.

Visible output, conversations and displayed tool results are saved as **plain text**. Review the contents before sharing. Raw output logs live in `.agent-note-terminal/`; retain the logs and plugin data with the notes for recovery. The plugin does not separately log raw keystrokes or non-echoed passwords. Generic terminal recording does not promise semantic role classification or native context resume for every agent. New records use text differences and interaction boundaries. Unknown full-screen applications may still include interface text or lack a recognizable input field; only input confirmed on screen is labeled as yours. Ambiguous same-text bordered rows are retained as output rather than discarded, so an unknown interface can still include an input recap. Unshown content cannot be recovered from terminal output. Raw output logs can contain echoed drafts and sensitive values printed by the CLI, even when these are omitted from the readable note. A power loss can lose data that has not reached disk. Do not run the same session on two computers concurrently.

---

# TermNote · 终端笔记

右侧上下分栏、多标签、持续保存的 Obsidian 桌面终端。**中央保留原文，上方查看备份，下方直接使用系统终端。** 每个标签对应独立 Markdown 备份，关闭后仍可阅读和检索。

![右侧上方备份、下方系统终端](docs/preview.png)

## 安装与开始

- Obsidian 桌面端 1.14.4+，仅支持 macOS / Windows。
- Python 3.9+；macOS 无额外 Python 库。Windows 10 1809+ / Windows 11 还需在同一解释器安装 `pywinpty`。
- 从 [社区页面](https://community.obsidian.md/plugins/agent-note-terminal) 安装 TermNote；也可在 BRAT 添加 `ptwm-git/termnote`，或从 [发行版](https://github.com/ptwm-git/termnote/releases/latest) 下载 ZIP 手动安装。
- 手动安装时，把包内 `agent-note-terminal` 文件夹放入知识库 `.obsidian/plugins/`，在设置 → 第三方插件启用 TermNote。插件 ID 和既有数据路径保持兼容。
- 设置 → TermNote →「检查终端环境」点击检测。需要时填写 Python 解释器的完整路径。

打开一篇文件（从书签进入也一样），点击左侧终端图标，或执行「TermNote：在当前文件右侧打开终端」。插件在原生右侧栏打开，上方展示自动备份，下方运行系统 Shell，同时在当前文件的目录新建“终端页面一.md”。原文不被终端写入。右键文件、文件夹也有对应入口；没有中央文件时可选择目录。

在下方直接输入你平常使用的命令：

```sh
opencode
claude
codex
```

这些程序需要自行安装和登录，不附带模型账户。新建会话不再默认绑定 OpenCode，也无需在插件中选择 Agent。macOS 默认使用登录 Shell（读取其环境和别名），Windows 默认 PowerShell；Shell 路径、JSON 参数和工作目录可以选填。工作目录默认是备份所在文件夹。若命令被你自己的 Shell 别名覆盖，可使用程序的完整路径，或用 `command opencode` 等方式绕过别名。

## 布局与外观

- 拖动右侧栏左边界：向左扩大终端工作台，向右给中央文档更多空间。使用 Obsidian 原生侧栏宽度控制。
- 拖动记录与终端之间的分隔条：调整上下比例；聚焦分隔条后也可使用上下方向键，Home / End 调到边界。
- 默认上下字号均为 12px。终端默认黑底浅字，备份默认跟随 Obsidian 主题。
- 设置中「终端外观」「备份外观」分别提供字号、黑色 / 灰色 / 浅色 / 跟随主题预设，以及背景和字体自定义颜色。上下可使用不同配色，修改会即时生效并保存。
- CLI 自行输出的 ANSI 彩色文字仍由 CLI 控制；字体颜色设置控制默认文字。

## 多标签与文件

- 「＋」创建新的独立系统终端和备份。优先使用中央当前文件所在目录；没有文件时沿用当前终端目录，或选择文件夹。
- 同一来源文件再次调用时，会显示其仍运行的会话；会话结束后再次调用则创建新的备份。打开已有备份文件会显示其历史，避免覆盖旧对话。
- 默认按目录查找最小空缺序号“终端页面一 / 二 / 三…”。删除二、三后再次新建会先补二、再补三；重命名释放的默认名也可复用，已有文件不会覆盖，新文件使用新的会话 ID。
- 标签可拖动排序；工具栏或标签右键可重命名真实备份文件。文件列表中的重命名和移动也会同步。
- 「×」弹出「保存并退出 / 不保存 / 取消」。保存会结束进程并保留完整记录；不保存会结束进程，将插件生成的备份按 Obsidian 回收站设置移出原目录，并清理该会话日志（旧继续副本与原件共享的历史归档保留）；取消保持会话不变。来源原文和其他会话不受影响。无法确认来源的历史文件仅提供保留选项。
- 标签右键「收起标签（后台继续保存）」或关闭整个右侧面板可继续后台运行；方形结束按钮只停止并保存，不关闭标签。历史入口可重新打开已保留记录。
- 「在中央打开备份笔记」可正常编辑和查阅 Markdown；「导出 Markdown 到本地」通过系统另存对话框选择保存位置；取消不写文件。复制按钮复制已保存的完整备份。
- 正常退出 Obsidian 会结束程序；再次打开恢复文字和标签，不自动执行历史命令。新的对话用「＋」。

## 保存、恢复与旧版升级

从 0.3.1 开始，新建标签使用增量对话格式：

- 「我」只记录提交时已经显示在终端中的完整输入；编辑草稿和退格合并，不逐字写进笔记。不回显的密码和掩码不会作为输入文本归档。
- 「终端」持续合并当前输出，流式回答扩展同一个块；清屏、菜单高亮和常见加载动画不反复追加整屏。真实换行及不同轮次的相同回答保留。
- 「操作」记录通过方向键导航后的全屏确认；可见的模型列表、切换结果和后续对话继续保存。
- 输出和确认事件先持久化到 `.agent-note-terminal/<会话ID>.jsonl`，再每约 500ms 同步一次备份。这个间隔用于落盘合并，不是定时截取画面；不同保存频率和重载得到相同投影。

通用终端依据实际显示内容与操作边界整理，不假定所有程序都具有用户/助手/工具结构。未知全屏程序可能保留界面文字或没有可识别输入框；无法确认角色的同文边框行会优先保留为输出，因此这类界面仍可能出现输入回顾文字；未能确认的输入不会猜测归类，屏幕从未展示的内容也无法凭空补齐。原始输出日志保留全部终端输出，因此仍可能包含回显草稿或程序打印的敏感内容；分享前请检查。插件不单独保存原始按键。

备份的会话区域使用 HTML 注释标记。可以编辑区域外正文；若修改或删除受管理区域，插件停止覆盖并显示待同步。「更多操作 → 恢复记录」会先备份原笔记，再从完整日志重建。日志可从更多操作在系统文件管理器中显示。日志缺失或损坏时保留原笔记，不用空记录覆盖唯一历史。

删除来源文档不会删除已经形成的备份，也不会把后来同路径创建的新文档关联到旧终端。删除备份文件则停止对应会话并保留日志，不自动重建被删除的文件。

升级 0.3.1 后，旧记录默认原文保留，不自动批量去重。打开旧标签，在「更多操作 → 生成精简记录副本」生成同目录“原名（精简记录）.md”；重复操作自动避开重名，原件及日志不变。旧日志没有单独的输入确认，副本不会猜测用户角色；日志缺失或损坏时拒绝生成完整副本。继续旧 OpenCode 增强会话会先另建“原名（继续）.md”，后续内容写入该文件。

自 0.3.0 起，原会话、笔记和启动快照保留；新标签统一使用系统 Shell，旧的中央工作台会迁到右侧。旧 OpenCode 增强会话仅在历史菜单中明确选择继续或补齐时使用原配置与固定原生 ID，不会因升级自动运行。已有会话所在原文仍保留，不会自动拆分或迁移历史内容。

已生成的 Markdown 无需插件即可阅读。恢复/跨设备同步应同时保留笔记、`.agent-note-terminal` 和插件数据；不要在两台电脑同时运行同一会话。断电或强杀前尚未落盘的尾部无法保证恢复。

## 权限与验证范围

本插件以当前用户权限启动本机程序；命令可能读写知识库外的文件。本地导出写入你明确选择的路径。插件无遥测，不自动下载安装依赖，不读取 Agent 认证文件。模型访问、密钥及费用由对应 CLI 管理；旧增强 OpenCode 模式使用仅监听 `127.0.0.1` 的认证服务。

对话、工具结果和终端显示以明文保存；分享前请检查实际内容。macOS Obsidian 的布局、真实终端输入、持续保存、配色、拖动、导出和升级已验证；Windows 后端与真实 CLI 在 CI 验证，Windows Obsidian 图形界面仍待人工试用。其他未测范围见 [验证记录](docs/VALIDATION.md)，社区审核结果见 [发布记录](docs/RELEASE.md)。

## 开发

```sh
npm install
npm run check
npm run package
node scripts/install.mjs "/测试知识库绝对路径"
```

官方 Obsidian ESLint 的 Error 阻断发行，静态 Warning 保留可见；TypeScript 严格编译继续阻断类型错误。源码使用 MIT；第三方许可见 THIRD-PARTY-NOTICES.txt，main.js 内嵌许可文本及自有 Python 桥接源码。

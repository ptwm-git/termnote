# 首版技术与界面设计

## 目的与界面

为每个终端会话生成可独立阅读的笔记；同一个 Obsidian 插件页面内可切换多个独立会话。

视觉方向：工业工具式工作台，继承 Obsidian 的设计系统。颜色采用主题的 background-primary、background-secondary、text-normal、text-muted、interactive-accent；默认深色参考 #1e1e1e、#262626、#dadada、#999999、#7f6df2，实际跟随用户主题。字体采用 Obsidian 文本字体与 monospace 字体，图标采用 Obsidian 自带 Lucide。这里明确采用宿主主题的字体和强调色，覆盖通用 ui-design 的颜色/字体限制，避免插件与宿主割裂。

布局：顶部横向标签栏与新增按钮；下方操作栏展示绑定笔记、进程和保存状态；主区域是终端，右侧可显示笔记记录预览，窄窗口时改为上下排列。空状态显示“使用当前笔记”与“新建终端页面”。常用操作为启动、打开笔记、重命名、日志、结束、收起。关闭按钮的提示明确说明后台仍运行。

## 模块

- main.ts：生命周期、入口、文件事件、设置。
- manager.ts：一文件一会话、持久化注册表、命名序号、建文件与标签顺序。
- session.ts：桥接子进程、输出回放、状态与保存队列。
- transcript.ts：headless xterm 处理终端控制、完整行、清屏与替代屏幕快照。
- note.ts：只更新会话的 Markdown 区域；记录区域基线比较，检测用户同时修改；重试恢复时以日志重建。
- proof.ts：在笔记写入前，持久化最近四个插件投影的摘要，区分注册表落后与真实用户修改；防止异常退出后的错误冲突提示。
- view.ts：浏览器式多标签和 xterm 视图，DOM 收起不销毁进程。
- bridge.py：独立 Python 子进程，macOS 使用标准库 PTY，Windows 使用 pywinpty。以 JSONL 与插件通信；每条输出先写日志并同步磁盘，再发送给插件。输入仅用于终端，不额外记录原始按键。

Python 避免把 Electron 版本特定的原生模块加载到 Obsidian。macOS 要求 Python 3.9+；Windows 要求 Python 3.9+ 与 pywinpty。提供设置和检测，不自动下载或静默安装依赖。

## 数据与恢复

- 注册表保存在插件 data.json：配置、会话 UUID、文件路径、标签可见性及顺序、每目录序号。
- 原始输出日志位于知识库 `.agent-note-terminal/<UUID>.jsonl`，含启动信息、尺寸、输出与退出事件；日志可从工具栏定位，支持重新播放，不依赖终端滚动缓冲。
- 绑定标识写入笔记中的 HTML 注释。复制笔记时重新生成标识，移除复制来的受管记录并保留为只读旧记录，避免串写。
- Markdown 受管区域包含状态、会话元信息、已完成行、当前行和必要的 TUI 快照。代码围栏长度根据内容动态确定。通用模式不猜测对话角色。
- 输出日志是恢复依据，插件每 500ms 将可读记录投影到笔记；写入时检查区域是否被用户改动。发生冲突时保留日志与待同步状态；显式“恢复记录”将旧区域备份后重建。
- 退出/停用时结束桥接进程并收尾；异常关闭时桥接 stdin 的 EOF 触发子进程清理，下一次加载从日志重建，打开历史记录不执行命令。
- 清屏、替代屏幕的文字保存为标记快照；重绘中间帧的完整依据是原始日志。首版不提供 Agent 语义适配。

## 生命周期与资源

会话由插件持有，不由某一个视图持有；关闭视图或标签不停止会话。结束与收起是独立操作。每次输入路由到获得焦点的终端实例。文件被删除立即停止对应进程，保留日志，明确标记文件丢失；不重建被删除文件。

## 验证

Node 测试覆盖命名、文件映射、记录围栏、冲突恢复、Unicode、ANSI、长输出、日志损坏尾部恢复。Python 集成测试使用真实 PTY 验证交互、中文分片、窗口尺寸、stdin EOF 与进程清理。Obsidian 实际操作验证多标签、改名、关闭、恢复与笔记保存。Windows 由 GitHub Actions Windows 作业提供可运行验证脚本；没有实际结果时明确标记未验证。

资料：[Python PTY](https://docs.python.org/3/library/pty.html)、[pywinpty](https://github.com/andfoy/pywinpty)、[Obsidian Vault](https://docs.obsidian.md/Plugins/Vault)、[xterm.js](https://xtermjs.org/)。

## 0.2.0 执行设计：Agent 可选与能力适配

用户已授权完成剩余工作。按以下顺序执行并验收，无需再次确认已有需求：

1. 标准安装：构建把自有 bridge.py 作为字符串内嵌 main.js，运行时通过 Python `-c` 执行，不落地或下载额外脚本；仅三个标准发行文件即可运行。
2. Agent 配置：增加通用/OpenCode 适配模式、预设和只读版本检测；保存启动配置快照。切换已有会话的配置创建同目录新笔记；已删除配置的历史仍能显示并以原快照继续。
3. OpenCode：按实际 major 版本区分 v1/v2；每会话启动仅监听 127.0.0.1 的私有服务，生成临时认证信息，经 PTY 连接明确的原生会话 ID。v2 已在隔离配置环境实际获取 OpenAPI，路径使用 `/api/session` 与 `/api/experimental/session/{id}/export`；v1 按官方 Server/CLI 文档使用 `/session` 和 `/session/{id}/message`。启动前检查会话存在性，绝不用最近会话或静默重建丢失的 ID。
4. 归档：每次成功获取完整原生数据后，校验绑定 ID，按消息/片段 ID 合并，先 fsync 原生 JSON 快照并原子替换，再更新 Markdown。角色作为可读标题，消息 ID 放在源码注释中追溯，状态事件、工具输出与终端重绘记录可折叠；终端回放仍独立保留。同步失败显示原因，保留上一次成功快照；继续会话和手动补齐均是明确操作。加载历史只读取本地记录。
5. 生命周期：服务通过自有 Python 监护进程启动，插件管道 EOF 或退出时结束服务进程树；停止终端后做最后一次同步再停止服务。服务口令仅存在内存/子进程环境中，不写入笔记、配置或输出日志。
6. 验证：覆盖版本差异、两个同目录会话、配置快照、ID 错配、增量更新去重、工具结果、磁盘保存失败、恢复及进程清理；实际 OpenCode 使用隔离 XDG 路径与本地模拟模型提供商验证协议，不读取用户认证或消费模型额度。macOS 在 Obsidian 中验证；Windows 使用 CI 真正运行后才能标记通过。

OpenCode 的原生 `/new` 或切换历史不改变笔记绑定；界面明确提示新增对话使用插件「＋」。原始终端流始终继续记录，结构化归档只针对已绑定 ID。

- 在现有 Profile 基础上区分“启动配置”和“增强适配器”。用户可以自由新增配置；适配器能力须由实际版本验证后提供，不能用预设名称判断是否支持会话恢复、角色记录或模型选择。
- 每场会话保留启动时的配置快照与适配器信息。编辑默认配置不修改已存在会话；跨 Agent 切换通过新建笔记开始。
- OpenCode 作为首个增强适配器。每笔记绑定明确的 OpenCode session ID；多标签同目录不能使用一个隐式“最近会话”游标。
- 结构化记录以原生消息与片段标识去重；终端日志和结构化记录可以关联，但不能混用“屏幕日志恢复”与“模型会话恢复”的语义。
- 模型及认证优先采用 Agent 本身提供的配置方式，未知 Agent 保留通用参数入口。插件笔记不保存 API 密钥。
- 本机只读探测：`opencode --version` 为 v2.0.26；`opencode session --help` 提供 export 子命令，`opencode api --help` 提供 OpenAPI operation/HTTP path 调用，主命令支持显式 `--session`。在线文档部分页面仍使用较早的命令布局和接口；实际开发需按版本探测，不直接套用旧参数或假定 API 路径不变。
- 本轮只检查版本和 help，没有启动 OpenCode 服务、读取历史会话或凭据，也没有进行模型对话。

调查资料：[OpenCode 提供商](https://opencode.ai/docs/providers/)、[CLI](https://opencode.ai/docs/cli/)、[Server](https://opencode.ai/docs/server/)、[SDK](https://opencode.ai/docs/sdk/)。

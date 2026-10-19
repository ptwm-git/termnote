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


## 0.3.0 右侧纯终端设计

以 Design-Brief.md 为当前界面设计。main.ts 使用原生右侧 WorkspaceLeaf，读取最近中央文件作为来源；manager 在串行队列内创建独立备份并记录 sourcePath，保留旧 record.path 为真正归档目标。settings.ts 迁移默认新会话到独立系统 Shell 配置，历史 profiles/launch/native 保留而不自动启动。view.ts 上方 Markdown、下方 xterm PTY；原生侧栏宽度由宿主调整，内部水平分隔条保存比例。appearance.ts 负责两区独立字号/配色和纯数据校验。export.ts 使用已验证宿主支持的 Electron 原生保存对话框，先完成笔记同步，再原子写入用户所选路径；取消不写。原始日志、快照、冲突与恢复保护不改格式。


## 0.3.1 增量归档设计

新会话设置 transcriptVersion=2；旧会话继续旧投影，避免升级静默改写历史。新 Transcript 基于 headless 终端缓冲区，普通模式保存完成行/当前输出尾行，全屏模式进行有序行差异和流式更新；提交输入封存上一输出块，每轮独立去重。render仅序列化，不产生快照或改变投影状态。原始output日志保留，增量段按事件顺序确定性重放。

InputTracker 只在内存管理编辑状态；提交前等待已回显的终端更新，读取输入区域，只有显示确认的文本才通过bridge的interaction事件落盘。edit/cancel/submit等边界不含原始按键；不回显或掩码输入无正文。Enter按写入队列排序，先持久化确认输入事件，再将提交键送入PTY。关闭等待该队列收尾。菜单非文本提交用操作标签，不猜测未知CLI角色。

版本2新格式独立测试：普通行、长输出、Unicode/软换行、重绘/清屏/替代缓冲、流式变化、菜单确认、不同轮合法重复、草稿/回显/密码、不同flush频率/重放、真实PTY和实际CLI。旧笔记通过显式菜单生成同目录普通精简副本，绝不覆盖原件；日志校验失败拒绝生成。现有原生OpenCode历史优先原生结构化消息。

依据：[xterm缓冲区](https://xtermjs.org/docs/api/terminal/interfaces/ibuffer/)、[软换行](https://xtermjs.org/docs/api/terminal/interfaces/ibufferline/)、[解析与write回调](https://xtermjs.org/docs/guides/hooks/)。不新增第三方依赖。


### 0.3.1 实现补充

- 编辑事件仅附逻辑行数元数据，支持多行粘贴时抑制草稿；提交文本必须与终端当前输入行或边框输入区匹配。原始输出日志可能包含CLI回显的编辑过程，输入事件不记录原始按键。
- 全屏差异使用稳定行身份、滚动时释放离屏行身份；已确认的边框输入回显标为临时行。同步绘制模式 CSI ?2026h/l 在事务结束时捕获，避免半帧残影；常见Braille动画归一化。
- 新轮清空整个会话时允许相同回答重新归档；持续显示的旧对话保留原身份，不因保存定时器重复。render只序列化，所有状态由有序事件驱动。
- 日志结构与序号共享验证；未知事件、缺失输出、非法交互和尺寸不作为完整恢复来源。末尾截断只恢复完整前缀并禁止精简副本。
- 恢复旧版本笔记后冻结其原投影；读取上方预览仍显示已保存原文。精简副本显式新建普通Markdown，不绑定进程。旧增强会话继续以及可重试的旧启动失败会先复制同目录“（继续）”文件，保留原件。

- TUI用户回显作为轮次边界；相同问题从画面底部向前匹配已确认轮次，输入边界之前滚出用户行的历史沿用已知身份，后方相同回答归新轮。终端DA/CPR/OSC等自动响应不进入用户编辑/导航状态；取消保护持续到Ctrl-C回显换行或清屏完成。

- 不能凭“裸竖线边框 + 同文 + 后续有正文”推断输入角色；仅明确提示符/输入框形态排除回显，歧义同文输出优先保留。回显候选可用于轮次匹配，但候选本身不授权删除。


## 0.3.2 输入与关闭管理

- view删除Cmd/Ctrl+V手动readText+paste分支，xterm原生paste为唯一入口；保留终端原生括号粘贴与多行规范化。500ms只负责保存，不更改输入路径。
- naming提供从1查找最小空缺的异步分配函数；Manager串行创建，旧counters保留兼容但不控制编号；每次新建生成独立UUID。
- 单标签X进入原生CloseModal（取消/不保存/保存并退出）；保存失败不隐藏。显式收起仍保留。整个工作台关闭不改后台语义。
- RecordData新增generated与discarded可选标识。generated只由创建备份或继续副本时设置，历史sourcePath!=path提供生成依据；不推断未知旧原文可删。
- Manager串行关闭，关闭中禁止启动；停止后保存或校验绑定并持久化discarded意图，然后调用FileManager.trashFile尊重宿主回收站设置。只在实际移除后清理本ID的jsonl/projection/native文件和索引；失败保留可重试信息。
- load遇到discarded：文件仍属于原会话时保留并恢复可操作状态；文件已无/同路径属于新会话时只清理旧ID的日志及索引，不删除该路径。被关闭pane中止回放读流、dispose xterm，防止Windows文件句柄占用和资源泄漏。
- 自动测试覆盖分配/生命周期/故障，真实Obsidian用独立测试文件验证粘贴与Modal按钮；不触及正式库中运行的Agent。独立fresh审查后按既有固定SHA/CI/来源证明/BRAT/社区扫描流程发布0.3.2。

依据：[xterm按键和paste](https://xtermjs.org/docs/api/terminal/classes/terminal/)、[Obsidian trashFile](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/trashFile)。

0.3.2 历史归档保全补充：继续旧增强会话的副本可能与原件共享同一 UUID 日志。不保存仍可移除继续副本，但共享日志与原生归档必须保留，并明确提示；不将历史原件的恢复依据当成本次临时文件删除。共享属性持久化，旧记录按来源绑定迁移，无法核验时优先保留。

## 0.3.3 字形与恢复时序

xterm DOM按W的英文fontBoundingBox测量格高，默认lineHeight=1并逐行overflow:hidden，macOS中文回退字体超出格高时笔画被切。使用xterm lineHeight=1.3（12px实测14→18px行框），让渲染、光标、fit及PTY尺寸同源；主题改变更新fontFamily参与外观key。不放宽行overflow，不使用top偏移。

onload先建立Manager、注册视图与事件，然后onLayoutReady启动唯一加载Promise；首次布局时不await该Promise，已经就绪的手动启用则等待完成。公开入口与删除事件等待ready；恢复前的rename即时更新索引路径和已有writer路径，加载中移动的ID在首轮结束后按新路径和UUID重新建立投影，并恢复原可见性；初始视图保留activeId，显示正在恢复而不清空选择。shutdown若加载未开始先将Manager关闭并释放ready，若正在加载先等待收尾。绑定核验后将旧missing改idle再从完整日志恢复；异UUID不变。

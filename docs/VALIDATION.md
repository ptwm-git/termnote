# 验证记录

## 0.3.3 字体与初始化 — 2026-10-19

- macOS默认等宽字体实际复现中文上沿裁切：xterm DOM按英文W测格高、默认1倍行高不足以容纳回退中文字形，逐行overflow:hidden裁掉笔画。同字号1.3倍后完整。对照见 [实际截图](font-rendering-0.3.3.png)。实际产品10/12/16/24px行框为14/18/24/36px，fit所得网格均未越出终端区域；主题fontFamily变化即时重测，设置恢复原值。
- 工作区恢复推迟至layoutReady，先注册视图不阻塞布局；公共入口等待同一任务，恢复中的新建/历史在视图或插件关闭后取消。加载前/中重命名即时追踪，移动路径按UUID重新建立投影；历史共享来源路径变化也重新核验，避免旧路径不存在结论误清日志。
- 新增加载绑定读取失败保护，未完成restore不能用空历史覆盖笔记；已恢复后的普通写入冲突继续允许修复。现80项Node +7项Python、类型检查/构建通过，官方ESLint 0 Error /101 Warning。
- 实际独立库0.3.3运行0.3.2 GUI脚本，粘贴1份、Modal三选择、补号及后台保存通过，原74会话/72笔记保持。单测试库窗口重新加载后79ID、77笔记、79原始日志、22可见标签与activeId精确保留；0自动运行、0健康错误，仅2个历史同路径异ID保护记录维持missing。脚本 scripts/obsidian-v033.mjs 的font/reload/verify可复验；没有重载正式库窗口。
- fresh最终独立复核PASS：初始化/退出/失败与两类加载中移动竞态均由独立探针确认保护。最终修正版GUI复验通过：原79ID/77笔记保留，字号/主题重测一致；再重载后84ID/82笔记/84日志/26可见标签与activeId均保持，0自动运行/0健康错误。两平台CI、发行来源证明、BRAT与社区正式扫描待完成。Windows Obsidian图形界面/原生剪贴板、全应用强杀断电和云同步并发仍未全面验收。

## 0.3.2 粘贴与退出管理 — 2026-10-19

- 本机 macOS / Apple Silicon、Obsidian 1.14.4、Python 3.14.6。新增13项真实 Manager/Session/NoteWriter 结合模拟Obsidian文件API的生命周期用例；本机74项Node +7项Python、类型检查及构建通过，官方ESLint 0 Error / 101 Warning。保存尾部等待、关闭中拒绝启动、旧原文/替换文件保护、索引/回收站/日志清理失败，以及中断删除的安全重载均覆盖。
- 实际独立test-vault中，0.3.1同一次DOM Cmd+V及系统paste事件得到两份输入，0.3.2得到一份；英文、中文和多行含括号粘贴各一份，等待650ms不增加，没有额外Enter。不读取用户剪贴板，测试仅使用内存fixture。
- 实际标签X打开原生Modal：取消与Esc保留进程/文件；保存并退出停止进程并保留尾行；不保存删除二/三的生成备份及各自日志，来源原文和一保持一致；新建依次补二/三，使用全新UUID。关闭整个工作台后真实Shell仍接收命令并落盘，重开预览可读；全部测试进程已停止。
- 原54个记录ID及52份现存笔记逐字节哈希保留。所有实际变更由准确basePath保护，未改动正式Documents知识库的运行会话。脚本 scripts/obsidian-v032.mjs 可在独立测试库复验。
- 独立审查发现的旧继续会话启动/关闭竞态、原生同步失败误关闭、关闭中原生补齐竞态、共享历史归档删除和已关闭Modal错误不可见均已修复，补充回归测试。最新真实脚本再次通过，原70个ID/68份笔记保留。fresh最终复核PASS（全部检查及3项独立故障/并发探针），[固定源码CI39215299201](https://github.com/ptwm-git/termnote/actions/runs/39215299201)的Windows/macOS检查及真实Windows PowerShell/OpenCode协议通过；macOS Node74、Windows Node72通过/2个固定POSIX用例跳过，Python均7项通过。固定提交27cbd68的社区预览Completed、无Error；发行工作流39215727531与标签检查39215727532成功，已形成未公开草稿；用户新增字体反馈后合并到0.3.3发行，不单独公开0.3.2。BRAT与社区正式扫描统一验收0.3.3；Windows Obsidian图形界面及真实Windows剪贴板未实测，不能以Node/ConPTY CI代替。

## 0.3.1 增量对话 — 2026-10-19

- 本机 macOS / Apple Silicon、Obsidian 1.14.4、Python 3.14.6。61 项 Node + 7 项 Python、严格类型检查及构建通过，官方 ESLint 0 Error / 101 Warning。
- 回归覆盖普通流式输出、真实重复行与12050行输出、101000字符长行、输入/回显分段、Unicode/退格/历史/括号粘贴、三行草稿取消、密码/掩码、Ctrl-C回显、后台输出、TUI重绘/同步绘制/滚动/插入/相同回答、spinner、设备回复过滤、不同保存频率确定性、日志损坏结构校验及旧原件冻结。真实Python getpass与zsh多行粘贴端到端通过。
- 独立 test-vault 普通系统Shell直接运行外部 OpenCode 2.0.26，记录 native:false，使用私有服务、隔离XDG和本地模拟模型，不使用用户密钥或额度。实际 `/models`、筛选test2、20次方向键导航、模型与variant确认、两轮中文输入和完全相同回答通过；每个问题一份、回答两份、模型列表一份、操作独立，未生成整屏快照。脚本 scripts/obsidian-v031.mjs，最终结果 ok:true。
- 停止后已保存Markdown可读，禁用/启用插件后对话投影逐字节相同；53个实际记录ID及设置保留，没有自动启动程序。旧39份已有笔记哈希均不变。实际生成两份精简副本，同目录、名称避重，原件及会话索引不变；旧日志没有确认输入时不猜测用户角色。
- 全部CLI eval脚本增加准确测试库路径保护；Obsidian CLI 的 vault 参数在本机未稳定选中目标，先打开独立库并由脚本验证真实basePath。没有重载或改动正式 Documents 知识库中的运行会话。
- fresh独立审查发现的多行草稿、跨轮相同回答、滚动重复行、动画、日志结构及取消后回显问题均已补用例修复；Ctrl-D及快速取消后继续输入、边框同文歧义均补充回归；最终独立复核 PASS（33项投影单元及类型检查）；首次Windows CI发现ConPTY光标重绘使提示符输入重复；已增加跨回合保留的非空提示符精确回显过滤和回归用例，修正版源码CI39207052019及发行CI39207322108全部通过；Windows为Node59通过/2跳过、Python7项与真实PowerShell/OpenCode通过。下载附件校验、ZIP CRC、运行文件对照及精确标签来源证明均通过，0.3.1已公开。BRAT实际从禁用的0.3.0安装文件更新到0.3.1，53会话、51现存笔记、设置均保留，内容一致，无健康错误或自动运行。社区正式扫描 Completed、无 Error，主程序/样式来源证明通过，平台重建 main.js 并确认逐字节一致，公开安装链接可用。
- Windows Obsidian图形界面、所有未知CLI的语义分类、未显示消息、原生上下文恢复、长时间压力、断电及云同步并发不作为已验收范围。通用记录可能保留界面文字；原始输出日志仍可含CLI回显的草稿。

## 0.3.0 右侧系统终端 — 2026-10-19

- 本机 macOS / Apple Silicon、Obsidian 1.14.4、Python 3.14.6。24 项 Node/TypeScript + 7 项 Python 测试、严格类型检查和构建通过；官方 ESLint 为 0 Error、96 Warning，未降低官方阻断规则。
- 新增真实系统 Shell 运行 CLI/中文输出/退出保存测试，设置迁移与独立配色重载，以及 Markdown 导出取消、UTF-8 覆盖和失败保留目标测试。
- 从实际 0.2.2 测试库升级加载 0.3.0：24 个旧会话保留，新默认系统 Shell、12px，旧中央工作台迁入原生右侧；升级未自动启动历史进程，健康记录无错误。
- 真实 Obsidian 创建来源原文，右侧另建同目录“终端页面一/二.md”，原文字节不变，重复调用复用运行会话；两个真实登录 Shell 独立保存，CDP 实际输入中文并按 Enter，结果进入 Markdown。
- 在普通 Shell 内运行实际 Codex 和 OpenCode 的版本命令；本机已有 opencode→code 的 Shell 别名，按真实 Shell 行为执行，使用 `command opencode --version` 可运行安装的 OpenCode 2.0.26。未改用户配置，未发送模型请求。
- CDP 拖动 Obsidian 原生右边界：右侧 300→488.5→419.5px，中央区域相应缩放、终端列数适配；内部实际拖动及键盘调整上下比例成功，重载后比例保留。
- 独立配色实测：下方浅色黑字、11px，上方灰色浅字、13px；CSS 和 xterm 配置均独立生效，持久化/重载保持。验收后恢复默认黑色终端、主题备份、12px。
- 通过真正的 macOS 原生 Save As 对话框将 Markdown 保存到临时目录，与已保存备份逐字节一致；取消及失败保留目标有自动测试。
- 实际重命名两个备份、移动整个文件夹后继续第三号；来源删除并同路径新建，第四号使用新会话且旧备份/进程保留；中央空白页不误用已关闭文档路径；关闭整个工作台仍持续保存，重新打开历史可见，结束后笔记可读。测试进程全部停止。
- fresh 独立审查发现并修复来源删除关联、中央上下文和文件夹计数迁移问题；独立复核与针对性内存验证 PASS。真实 Obsidian 回归覆盖三项。新增 `scripts/obsidian-v030.mjs` 在独立测试库实际运行，键盘输入、多终端、原文保留、独立外观、文件夹序号、同路径新来源、空白页上下文、后台保存、结束后可读和最后标签收起后重开预览均 `ok: true`。
- [源码 CI 39198160553](https://github.com/ptwm-git/termnote/actions/runs/39198160553) 与 [发行 CI 39198427499](https://github.com/ptwm-git/termnote/actions/runs/39198427499) 全部通过；Windows Node 23 通过 / 1 跳过（既有固定 /bin/sh 用例），Python 7 项及真实 PowerShell / OpenCode 流程通过。CI 附件校验值、ZIP CRC、本机字节对照与来源证明通过，已公开发布 0.3.0。实际 BRAT 0.2.2→0.3.0 保留 41 个记录及完整设置，健康错误和自动运行均为 0，历史预览可读，运行文件与公开附件一致。社区固定源码预览与 0.3.0 正式扫描均 Completed、无 Error；平台重新构建 main.js 并确认逐字节一致，主程序和样式来源证明 Pass，公开 Add to Obsidian 安装链接可用。
- Windows Obsidian 图形界面、原生输入法候选框、其他 CPU 架构、长时间压力、云同步并发、断电和磁盘满仍未全面验收。


## 0.2.2 社区标题补正 — 2026-10-18

- 设置首标题使用「运行环境」，不再包含插件名；第二标题「启动配置」，两者均为标准 Setting 标题。
- 官方 Obsidian ESLint 门禁：0 条阻断错误、121 条保留的静态警告；Obsidian 规范严重级别不降级，通用静态检查按平台所示列为 Warning，严格 tsc 继续阻断类型错误。
- 本机 20 项 Node/TypeScript、7 项 Python 测试与构建通过。实际设置页正常，24 个会话保留，无健康会话错误、没有自动启动程序。
- fresh 独立增量审查 PASS：39 条 Obsidian 规则与官方级别一致；将标题替回旧值可复现该 Error；版本、依赖、YAML、类型检查通过。社区固定提交 cda06018d367a29e71a314f67005504d19f8f881 的预览扫描已显示 Completed，无 Error；既有 Warning/Recommendation 保留。
- [源码 CI 39120133250](https://github.com/ptwm-git/termnote/actions/runs/39120133250) 的 Windows/macOS 规范检查、27 项测试、构建与真实 Windows OpenCode 协议全部通过。[发行工作流 39120489757](https://github.com/ptwm-git/termnote/actions/runs/39120489757) 全部成功，CI 附件的来源证明、SHA256SUMS、ZIP CRC 与本机构建对照通过。
- BRAT 0.2.1→0.2.2 实际升级成功，24 个原会话 ID 保留，无健康会话错误，无自动启动程序；安装文件与 CI 附件一致。社区正式 0.2.2 扫描已 Completed、无 Error；来源证明 Pass，平台实际重建 main.js 并确认逐字节一致。公开页面 Add to Obsidian 已为可用链接，目标 `obsidian://show-plugin?id=agent-note-terminal`。

## 0.2.1 审核修正 — 2026-10-18

- 仅改动设置页两处标题组件、双语 README、版本与发行工作流；会话协议、桥接和记录格式未改动。
- 本机重新运行 20 项 Node/TypeScript + 7 项 Python 测试、类型检查与构建全部通过。
- 实际 test-vault 禁用旧版本、标准安装 0.2.1、重新启用并打开设置页：两个 `.setting-item-heading` 分别为「TermNote · 终端笔记」「启动配置」，没有 h2/h3；24 个会话保留，健康会话无错误，未自动启动任何程序。
- fresh 独立增量审查 PASS：标题修正、版本一致性、工作流权限/附件/草稿/来源证明配置无实际缺陷；独立类型检查、YAML 解析及版本校验通过。
- [发行工作流 39119297320](https://github.com/ptwm-git/termnote/actions/runs/39119297320) 的 Windows/macOS 检查、真实 Windows OpenCode 1.19.3 协议及 Ubuntu 构建全部通过；来源证明生成成功，下载后 main.js/styles.css 的 gh attestation verify 均成功。ZIP CRC、SHA256SUMS、附件与本机构建逐字节对照通过。
- BRAT 2.2.0 从 0.2.0 实际升级至公开 0.2.1，24 个原会话 ID 完全一致，健康会话无错误，未自动运行任何程序；安装内容与 CI 发行一致。社区识别新版本并排队复审，最终结果见发布记录。

## 0.2.0 发布版 — 2026-10-18

本机为 macOS / Apple Silicon、Obsidian 1.14.4、Python 3.14.6。只修改独立 test-vault，没有向正式知识库安装。以下结果以实际执行为依据，未测范围单列。

- 自动检查：20 项 Node/TypeScript、7 项 Python 测试及严格类型检查/构建通过。新增覆盖原生消息更新和去重、工具结果、错误会话 ID 拒绝、快照写入失败、补齐/继续/停止互斥、服务 EOF/主进程先退出的进程树清理、缺失/损坏/序号缺口日志保护、首次启动失败后重载重试。
- 标准安装：禁用旧插件，在测试库中移除旧 bridge.py，只复制 main.js、manifest.json、styles.css 后重新启用。Python 检测、真实 Shell、多标签中文输出、后台保存、改名、复制/删除和重载通过。自有 Python 源码确实由 main.js 内嵌运行。
- OpenCode 2.0.26 实际程序：两个同目录私有服务和不同原生 ID，各自完成真实 CLI 到本地模型的请求/回答；真实 read 工具读取测试文件，工具结果进入可折叠笔记；原生模型切换 API 的 test→test2 事件归档；停止/重开使用原 ID，重同步不重复。脚本 scripts/real-opencode.mts。
- OpenCode 1.19.3 实际程序：从官方 GitHub Release 下载到独立临时目录，未替换用户安装；同一脚本以独立配置完成两个会话、CLI 模型对话、停止/继续与去重。1.x 原生 TUI 尚未在 Obsidian 中单独验收，模型在原生界面设置。
- Obsidian 原生 TUI：scripts/obsidian-v020.mjs 通过；两个内嵌 OpenCode 2.x 标签完成中文提问与回答，无串写；停止并重载插件后消息不重复、不自动启动；删除设置中的配置后仍能按历史快照继续原 ID，并保存第二轮对话。
- 隔离方式：以上 Agent 测试使用独立 XDG 配置/数据目录和本机确定性模型服务，不读取用户认证文件或历史，不消费实际模型额度。证明的是实际 Agent/PTY/协议/归档流程，不能当作外部模型质量或账户登录验证。
- 独立审查：已修复生命周期竞争、进程树遗留、日志缺失覆盖唯一笔记、预检查失败重载后无法重试及序号缺口保护问题；最后一轮恢复保全独立复审通过，真实笔记的空日志、多个合法前缀截断均拒绝覆盖，完整日志恢复保持原文。
- Windows/macOS CI：均实际通过。Windows 使用官方 Backend.ConPTY 常量、UTF-8 控制台初始化和 Job 对象清理；真正的 ConPTY、中文/Emoji、尺寸、持久化及清理通过。Windows 额外下载并运行官方 OpenCode 1.19.3，以本地模型完成两个独立会话、停止/继续和归档去重。[真实 Agent 验证运行](https://github.com/ptwm-git/termnote/actions/runs/39118186305)、[发行源码最终检查](https://github.com/ptwm-git/termnote/actions/runs/39118251780) 全部成功。Windows 的 Node 测试为 19 通过、1 跳过（该用例固定使用 /bin/sh），Python 7 项及单独的真实 ConPTY/OpenCode 流程通过；不把该跳过用例计为 Windows 通过。该结果不代替 Windows Obsidian 图形界面验收。
- 公开发行及 BRAT：已发布 [0.2.0](https://github.com/ptwm-git/termnote/releases/tag/0.2.0)。在 test-vault 使用 BRAT 2.2.0 从公开仓库强制安装最新版并重新启用成功；23 个已有会话均保留、无健康会话错误。远端安装的 main.js/styles.css SHA256 与发行产物一致；BRAT 重新序列化的 manifest.json 字段完全一致，无旧 bridge.py。更新检查成功并确认已是 0.2.0。

截图：[preview.png](preview.png)，来自真实 Obsidian 中运行的 OpenCode TUI 与旁边自动保存的 Markdown 预览；画面中的模型为本地测试提供商。

### 0.2.0 仍需人工验证

Windows 的 Obsidian 图形界面、原生输入法候选框、macOS Intel/Windows ARM、长时间压力、云同步并发编辑、整个应用强杀/断电及实际磁盘满未全面验收。已有插件重载/桥接 EOF、持续保存与故障测试不替代这些项目。不承诺所有未知 Agent 都能恢复原生上下文或精确分类角色。

---

# 0.1.0 历史验证记录

日期：2026-10-18。定位：可安装的首版测试包，尚未公开发布。

## 本机与自动检查

本机：macOS / Apple Silicon，Obsidian 1.14.4，Python 3.14.6。独立测试知识库为本项目 `test-vault`，没有向用户的正式 `Documents` 知识库安装插件。

- `npm test`：13 项通过，覆盖文件名、用户正文保留、复制解绑、围栏嵌套、自身笔记输出、颜色/回车覆盖、中文、超过滚动历史的长输出与超长单行、替代屏幕、真实 PTY 收尾及日志恢复。
- `npm run test:bridge`：6 项通过，覆盖真正的 TTY、中文输入、窗口尺寸、UTF-8 字节分片、正常退出、stdin EOF 清理、三个独立终端、启动失败记录和磁盘短写完整性。
- `npm run build`：TypeScript 严格检查与 esbuild 构建通过。
- `npm run package`：上述 19 项检查与构建通过后生成安装包；压缩包 CRC、文件清单、发行文件逐字节对照及 SHA256 校验通过。
- 独立 code-reviewer 发现的长单行截断、停止状态、错误提示、笔记自身标记输出、投影摘要持久化窗口、同路径重建及单笔记失败隔离问题均已修复。最终复审无剩余阻断问题。

## Obsidian 实际验证

`scripts/smoke-vault.js` 在 Obsidian 中实际执行，结果 `ok: true`：

- 并发新建三个同目录文件，正确命名为“终端页面一/二/三.md”。
- 三个真实 Shell 同时运行，各自的中文输出保存到独立文件，无串写。
- 重命名实际文件后继续保存；收起标签后继续输出及保存。
- 删除文件再重建同路径文件，分配新 UUID；复制笔记也分配独立 UUID。
- 运行 `cat` 输出自身笔记不再破坏会话区域识别和后续保存。
- 关闭整个插件视图后，后台继续写入；重新打开可显示历史。
- 主动结束后收尾保存；测试结束没有残留运行中的 Shell。

`scripts/verify-reload.js` 在插件重载后结果 `ok: true`：

- 已删除旧会话保持 missing，不抢占同路径新笔记。
- 点击界面“＋”实际创建下一页并启动独立 Shell，命名序号继续递增。
- 新页的输出进入实际 Markdown 文件；健康会话没有保存错误。

`scripts/keyboard-smoke.mjs` 使用 Electron CDP 输入实际中文键盘文字及 Enter，结果 `ok: true`。测试记录位于 `Agent 终端示例/终端页面四.md`；命令执行输出与输入回显分别核对，内容写入笔记，进程正常结束。

界面截图：[preview.png](preview.png)。测试库中保留 `Agent 终端示例` 文件夹的三个示例标签，可从“＋”开始自己的新会话。所有测试子进程均已停止。

Agent 检查：在嵌入式 Shell 中成功运行 `codex --version`。本机 `claude --version` 报告其自身原生程序未安装，没有修改全局 Claude 安装。没有发送真实模型请求或验证完整 Agent 对话。

## 尚未通过的项目

- Windows 的 Python/pywinpty/ConPTY 路径已实现，但本机无法实机运行；已提供 Windows/macOS CI 工作流，尚未上传执行，不能称为 Windows 验收通过。
- macOS Intel、Windows ARM 等架构未测试。
- 正常退出整个 Obsidian 应用和强杀整个应用尚未执行；已有插件重载、真实桥接 EOF、损坏日志末尾与恢复逻辑的验证，不能替代应用级测试。
- 原生输入法候选框、真实手工拖动标签、长时间高输出压力、同步软件同时修改、实际磁盘满及系统断电场景尚需人工验证。CDP 中文插入只证明中文文本输入链路，不证明所有输入法行为。
- 未提供 Agent 原生会话恢复或精确的用户/助手/工具角色日志适配。未知 Agent 的完整重绘事件保留在原始日志，Markdown 使用文字行及标记快照。

上述限制不阻止本机测试包交付，但在相应验收完成前不标记正式稳定版或全面跨平台兼容。

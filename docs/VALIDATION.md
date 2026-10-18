# 验证记录

## 0.2.2 社区标题补正 — 2026-10-18

- 设置首标题使用「运行环境」，不再包含插件名；第二标题「启动配置」，两者均为标准 Setting 标题。
- 官方 Obsidian ESLint 门禁：0 条阻断错误、121 条保留的静态警告；Obsidian 规范严重级别不降级，通用静态检查按平台所示列为 Warning，严格 tsc 继续阻断类型错误。
- 本机 20 项 Node/TypeScript、7 项 Python 测试与构建通过。实际设置页正常，24 个会话保留，无健康会话错误、没有自动启动程序。
- fresh 独立增量审查 PASS：39 条 Obsidian 规则与官方级别一致；将标题替回旧值可复现该 Error；版本、依赖、YAML、类型检查通过。社区分支扫描及发行结果在发布记录同步。

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
- Windows/macOS CI：均实际通过。Windows 使用官方 Backend.ConPTY 常量、UTF-8 控制台初始化和 Job 对象清理；真正的 ConPTY、中文/Emoji、尺寸、持久化及清理通过。Windows 额外下载并运行官方 OpenCode 1.19.3，以本地模型完成两个独立会话、停止/继续和归档去重。[真实 Agent 验证运行](https://github.com/ptwm-git/termnote/actions/runs/39118186305)、[发行源码最终检查](https://github.com/ptwm-git/termnote/actions/runs/39118251780) 全部成功。该结果不代替 Windows Obsidian 图形界面验收。
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

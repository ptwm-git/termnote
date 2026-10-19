# TermNote 发布记录

名称：TermNote · 终端笔记。插件 ID：`agent-note-terminal`。日期：2026-10-19。当前公开发行版本：**0.3.1**。

## 安装入口

- [GitHub 0.3.1 发行版](https://github.com/ptwm-git/termnote/releases/tag/0.3.1) 已公开，含三个标准运行文件、手动安装 ZIP 和 SHA256SUMS。
- BRAT 添加仓库 `ptwm-git/termnote`。已在独立测试库将安装文件置为0.3.0，再由BRAT在线更新到公开0.3.1；旧运行文件在更新前保持禁用，未启动降级程序。53个会话ID、51份现存笔记、完整设置均保留，记录内容与升级前完全一致，运行文件与CI附件匹配。
- [Obsidian 社区条目](https://community.obsidian.md/plugins/agent-note-terminal) 的0.3.1正式扫描已 Completed、无 Error。固定源码预览与正式发行两次扫描均通过；主程序和样式来源证明 Pass，平台重新构建 main.js 并确认逐字节一致，公开 Add to Obsidian 安装入口可用。

## 0.3.1 发行证据

- 新建标签按「我 / 终端 / 操作」增量记录；合并流式输出和已确认输入回显，模型列表/同步绘制不反复追加整屏。未知边框同文优先保留，避免误删回答，不承诺所有CLI的语义角色。
- 旧笔记默认冻结原投影，显式生成同目录精简副本；继续旧增强会话先另建文件。原始输出日志保留，损坏日志拒绝作为完整副本来源。
- 最终源码和0.3.1标签：`6cbe9c30db6a07b32b3b4a97f7c29cf68310d6a9`。固定提交社区预览 Completed、无 Error，且 [源码 CI 39207052019](https://github.com/ptwm-git/termnote/actions/runs/39207052019) 成功后才创建标签。
- [发行工作流 39207322108](https://github.com/ptwm-git/termnote/actions/runs/39207322108) 的 Windows/macOS 检查、真实Windows OpenCode1.19.3、Ubuntu构建/打包与来源证明全部成功。
- 本机及macOS CI为61项Node + 7项Python；Windows Node59通过、2个固定POSIX用例跳过，Python7项及实际PowerShell/OpenCode协议通过。官方ESLint为0 Error / 101 Warning，未降低阻断规则。
- 实际macOS Obsidian普通Shell运行外部OpenCode2.0.26，native:false，本地模拟模型、隔离XDG/私有服务；模型列表与variant确认、20次方向导航、两轮中文问题及完全相同回答通过。最终脚本ok:true，问题各一份、回答两份、列表一份。停止/重载投影逐字节一致，旧39份原件哈希不变。
- fresh独立审查/修复复核最终PASS。已补齐多行草稿、Ctrl-C/Ctrl-D、同文回答、滚动重复行、spinner、日志结构与ConPTY跨轮重绘回显用例。Windows首次验证发现的问题及修复过程保留在提交历史，不将失败运行描述为通过。
- 下载CI附件后，SHA256SUMS、ZIP CRC、六文件清单及三个运行文件逐字节对照通过。main.js和styles.css的来源证明均验证到准确0.3.1标签、源码SHA和发行工作流。
- ZIP SHA256：`c67931482684baef86982397c3f3fa0cbba6a728a0961cfadf8c5e2a90c7991e`。
- 社区正式扫描确认 Build reproduced the release main.js byte-for-byte；网络、依赖和混淆检查无阻断。Warning / Recommendation 保留，不描述为零警告。
- Windows Obsidian图形界面、未知Agent角色及未显示消息、长期压力和故障场景仍以验证记录的边界为准。

## 0.3.0 发行证据

- 右侧上备份/下系统终端；原文与同目录独立备份分开；多标签、可拖动布局、上下独立字号和配色、原生本地 Markdown 另存。新会话默认系统 Shell，旧 OpenCode 历史保留，升级不自动运行。
- 源码及标签固定在 `2862d424b3ac5ac9443382240735cde77481b456`。先完成社区固定提交预览、Windows/macOS [源码 CI 39198160553](https://github.com/ptwm-git/termnote/actions/runs/39198160553)，再创建 0.3.0 标签，没有覆盖旧标签和旧附件。
- [发行工作流 39198427499](https://github.com/ptwm-git/termnote/actions/runs/39198427499) 的 Windows/macOS 检查、Windows 真实 OpenCode 1.19.3 协议、Ubuntu 构建/打包与来源证明全部成功。
- 下载公开附件后，SHA256SUMS、ZIP CRC、六文件清单、三个运行文件与本机构建逐字节对照通过。main.js / styles.css 的 `gh attestation verify` 成功；来源证明见 [attestation 57256283](https://github.com/ptwm-git/termnote/attestations/57256283)。
- 社区正式扫描额外确认 **Build reproduced the release main.js byte-for-byte**；主程序和样式来源证明 Pass，依赖/网络/混淆检查无阻断。
- BRAT 安装的 main.js / styles.css 与 CI 附件逐字节一致，manifest 字段一致（BRAT 会重新排版 JSON），不需要 bridge.py。安装后右侧布局及历史文字实际可见。
- ZIP SHA256：`2621ba8b144dae89e955f442bdc377c07a46956db3abe6dc9d8b3cb2792abe1d`。
- 本机 24 项 Node/TypeScript、7 项 Python、类型检查和构建通过；官方 ESLint 为 0 Error、96 Warning。macOS Obsidian 的真实键盘输入、多终端、保存、原文保留、配色/比例重载、两向宽度拖动、原生 Save As、文件移动/来源删除重建及最后标签重开通过。
- 两次 fresh 独立源码/发行复核 PASS；发现的来源关联、上下文、文件夹计数、最后标签预览及 Windows 测试引号均已修复并复核。Windows CI 的 Node 为 23 通过、1 跳过（既有固定 /bin/sh 用例），Python 7 项、真实 PowerShell 新用例及独立真实 OpenCode 流程通过。

## 历史发行

- [0.2.2](https://github.com/ptwm-git/termnote/releases/tag/0.2.2)：社区正式扫描 Completed、无 Error；主程序/样式来源证明 Pass，平台重新构建 main.js 并确认逐字节一致，Add to Obsidian 安装链接开放。源码 `cda06018d367a29e71a314f67005504d19f8f881`，[发行工作流 39120489757](https://github.com/ptwm-git/termnote/actions/runs/39120489757) 成功，BRAT 升级保留 24 个会话。ZIP SHA256 为 `cfe4efe09502a9c229d3c58a2e9274b33fa90e71d3c6e289b983f10ed6869fa0`。
- [0.2.0](https://github.com/ptwm-git/termnote/releases/tag/0.2.0)：Agent 配置、OpenCode 恢复/结构化记录、标准安装、持久化保护与 Windows 后端验证完成；社区发现两处手工 HTML 设置标题错误。
- [0.2.1](https://github.com/ptwm-git/termnote/releases/tag/0.2.1)：改为 Setting 标题、补充英文说明和 CI 来源证明；实际升级保留会话。社区进一步指出标题重复插件名，随后在 0.2.2 改为「运行环境」。0.2.0 / 0.2.1 的历史失败状态不描述为通过。
- 0.1.0 本机测试包保留，显示旧名称 Agent Note Terminal，不属于公开市场发行。

终端的本机程序执行、文件访问、剪贴板和本地导出能力已在 README 披露。ZIP 与校验值是便利附件，标准安装只需 main.js、manifest.json、styles.css。Windows Obsidian 图形界面、其他 CPU 架构、输入法候选框和长时间压力等仍待人工验收，详见 [验证记录](VALIDATION.md)。不承诺所有未知 Agent 的角色分类或原生上下文恢复。

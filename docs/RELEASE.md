# TermNote 发布记录

名称：TermNote · 终端笔记。插件 ID：`agent-note-terminal`。日期：2026-10-19。当前公开发行版本：**0.3.0**。

## 安装入口

- [GitHub 0.3.0 发行版](https://github.com/ptwm-git/termnote/releases/tag/0.3.0) 已公开，含三个标准运行文件、手动安装 ZIP 和 SHA256SUMS。
- BRAT 添加仓库 `ptwm-git/termnote`。已从实际安装的 0.2.2 在线升级至 0.3.0，41 个测试记录 ID 和设置全部保留，没有健康记录错误，没有自动启动历史程序；其中包含原有 24 个旧会话。
- [Obsidian 社区条目](https://community.obsidian.md/plugins/agent-note-terminal) 的 **0.3.0 正式扫描已 Completed、无 Error**，公开 **Add to Obsidian** 链接已启用，目标为 `obsidian://show-plugin?id=agent-note-terminal`。源码预览与正式发行两次扫描均通过；Warning / Recommendation 保留可见，不描述为零警告。

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

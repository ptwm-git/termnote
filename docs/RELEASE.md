# TermNote 发布记录

名称：TermNote · 终端笔记。插件 ID：`agent-note-terminal`。日期：2026-10-18。当前发行版本：**0.2.2**。

## 安装入口

- [GitHub 0.2.2 发行版](https://github.com/ptwm-git/termnote/releases/tag/0.2.2) 已公开，含三个标准运行文件、手动安装 ZIP 和 SHA256SUMS。
- BRAT 添加仓库 `ptwm-git/termnote`。已验证公开安装与更新，当前实测从 0.2.1 升级至 0.2.2，24 个原会话 ID 一致，无健康会话错误、无自动启动程序。
- [Obsidian 社区条目](https://community.obsidian.md/plugins/agent-note-terminal) 已发布，0.2.2 正式发行扫描显示 **Completed**、没有 Error，公开页面已开放 **Add to Obsidian** 安装链接。已核对其目标为 `obsidian://show-plugin?id=agent-note-terminal`。

## 发行证据

- 公开仓库：[ptwm-git/termnote](https://github.com/ptwm-git/termnote)。0.2.2 标签固定在 `cda06018d367a29e71a314f67005504d19f8f881`；没有覆盖旧版标签或附件。
- [发行工作流 39120489757](https://github.com/ptwm-git/termnote/actions/runs/39120489757) 的 Windows/macOS 检查、真实 Windows OpenCode 1.19.3 协议及 Ubuntu 构建全部通过。
- main.js、styles.css 等附件由 CI 构建并生成来源证明。下载后 SHA256SUMS、ZIP CRC、六个文件清单及逐字节对照通过；`gh attestation verify` 对 main.js 和 styles.css 验证成功。BRAT 安装的运行文件与 CI 附件一致，manifest 字段一致（BRAT 会重新排版 JSON）。
- ZIP SHA256：`cfe4efe09502a9c229d3c58a2e9274b33fa90e71d3c6e289b983f10ed6869fa0`。
- 社区正式检查额外显示 **Build reproduced the release main.js byte-for-byte**，主程序与样式的 GitHub 来源证明均 Pass；依赖、网络与代码混淆检查没有阻断问题。已有 Warning/Recommendation 保留，不描述为零警告。
- 本机 27 项检查、实际设置页、最终恢复保全复审和两次 fresh 增量审查通过；macOS Obsidian 双原生 OpenCode 标签中文对话、恢复、工具归档和持续保存已实际验证。平台细节及未测范围见 [验证记录](VALIDATION.md)。
- 加入官方 Obsidian ESLint 发行门禁，39 条 Obsidian 规则保留官方严重级别。通用静态检查按社区所示列为 Warning，严格 TypeScript 编译仍阻断类型错误；当前 0 Error、121 条既有静态 Warning，不声称零警告。

## 历史发行

- [0.2.0](https://github.com/ptwm-git/termnote/releases/tag/0.2.0)：完成 Agent 配置、OpenCode 恢复/结构化记录、标准安装、持久化保护与 Windows 后端验证；BRAT 公开安装和更新检查通过。社区发现两处手工 HTML 设置标题错误。
- [0.2.1](https://github.com/ptwm-git/termnote/releases/tag/0.2.1)：改为 Setting 标题、补充英文说明和 CI 来源证明；实际 0.2.0→0.2.1 升级保留会话。社区进一步指出标题重复插件名，已在 0.2.2 改为「运行环境」。0.2.0/0.2.1 未通过社区审核，不将其失败状态描述为通过。
- 0.2.2 在社区固定提交预览扫描完成且无 Error 后才创建标签及发行；原功能、会话 ID 和数据格式兼容。
- 0.1.0 本机测试包保留，显示旧名称 Agent Note Terminal，不属于公开市场发行。

自动检查提示的本机文件访问、执行程序和剪贴板能力属于终端功能，已在 README 披露。手动 ZIP 与 SHA256SUMS 属于便利附件，Obsidian 只下载三个标准文件。Windows 图形界面等未测范围继续明示；不承诺所有未知 Agent 的精确角色分类或原生上下文恢复。

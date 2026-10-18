TermNote · 终端笔记：在 Obsidian 中运行本机 Agent，多标签、一页一会话、自动持续保存。

0.2.2 将设置页标题改为「运行环境」，避免重复插件名，并加入官方 Obsidian ESLint 门禁。通过社区分支复审后，再由 GitHub Actions 构建和生成来源证明。功能、笔记与历史会话继续兼容 0.2.0/0.2.1：OpenCode 原生会话继续、结构化消息/工具归档，以及可选的其他 Agent 启动配置。

测试：27 项自动检查、Windows/macOS CI；Windows 真实 OpenCode 1.19.3 协议测试。macOS 已在 Obsidian 1.14.4 中完成双 OpenCode 标签中文对话、恢复和保存验证。Windows Obsidian 图形界面待人工试用。

安装：
- BRAT 添加 `ptwm-git/termnote`，可安装及更新。
- 手动安装：解压 ZIP，把 `agent-note-terminal` 文件夹放入知识库 `.obsidian/plugins/`，启用 TermNote。
- 运行需 Python 3.9+；Windows 在同一 Python 环境安装 `pywinpty`。Agent 须自行安装并登录；模型账户、凭据和费用由 Agent 管理。

发行标准文件：main.js、manifest.json、styles.css。ZIP 为手动安装便利包，SHA256SUMS 用于校验；Obsidian 只下载三个标准文件。

[使用指南](https://github.com/ptwm-git/termnote#readme) · [验证范围](https://github.com/ptwm-git/termnote/blob/main/docs/VALIDATION.md) · [社区条目](https://community.obsidian.md/plugins/agent-note-terminal)

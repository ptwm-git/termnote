TermNote 0.3.0 按实际试用反馈调整为右侧「上方备份、下方系统终端」。中央原文保持打开，备份另建在同目录。

- 新标签直接进入系统 Shell，可自行输入 OpenCode、Claude Code、Codex 等已安装 CLI，不再默认绑定 Agent。
- 保留独立多标签；原生侧栏宽度可拖动，上下高度比例也可调整。
- 默认 12px 紧凑字号，终端与备份的底色、文字颜色和字号分别配置，提供黑色、灰色、浅色和跟随主题预设。
- 持续保存可读 Markdown，可通过系统另存对话框导出到本地。
- 保留旧笔记、会话与历史启动快照；修正来源删除后同路径重建的关联、空白中央页上下文和文件夹移动后的序号继承。

需要 Obsidian 桌面端 1.14.4+、Python 3.9+；Windows 还需要同一解释器的 pywinpty。仅支持 macOS / Windows。CLI 自行安装和登录。

本机 24 项 Node/TypeScript、7 项 Python 测试、严格构建及 macOS Obsidian 真实交互验收通过。Windows ConPTY/PowerShell 与真实 OpenCode 协议由发行 CI 验证；Windows Obsidian 图形界面仍需人工试用。普通终端保存可见输出和重绘快照，不保证任意 Agent 的角色分类及原生会话恢复。

手动安装：解压 ZIP，将 `agent-note-terminal` 文件夹放入知识库 `.obsidian/plugins/`；也可通过社区目录或 BRAT 仓库 `ptwm-git/termnote` 安装和更新。三个标准运行文件由 CI 构建并提供来源证明，SHA256SUMS 可用于校验。

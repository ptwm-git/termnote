# TermNote 发布记录

名称：TermNote · 终端笔记。插件 ID：`agent-note-terminal`。日期：2026-10-18。

## 已交付的 0.2.0

- 源码与测试：已完成，最终恢复保全独立复审通过；[发行源码 Windows/macOS CI](https://github.com/ptwm-git/termnote/actions/runs/39118251780) 通过。Windows 另有真实 OpenCode 1.19.3 协议验证。
- 公开仓库：[ptwm-git/termnote](https://github.com/ptwm-git/termnote)。[0.2.0 Release](https://github.com/ptwm-git/termnote/releases/tag/0.2.0) 已发布，提供 ZIP、main.js、manifest.json、styles.css、SHA256SUMS。
- 0.2.0 ZIP 的 SHA256：`561b1eb1c65b3620ac0684ed249c61eb4259545836b177cfb390e8a1b7099db0`。
- BRAT 2.2.0：添加 `ptwm-git/termnote` 已完成真实安装及更新检查。已有 23 个会话保留，主程序/CSS 与远端发行逐字节一致；manifest 字段一致，BRAT 仅改变其排版。
- 社区条目：[TermNote](https://community.obsidian.md/plugins/agent-note-terminal)。已提交并发布公开条目，自动审核尚在运行，安装按钮未开放。0.2.0 检查已报告设置页两处 HTML 标题错误；不把公开条目视为审核通过。

## 0.2.1 审核修正

两处标题已替换为 Obsidian 标准 Setting 标题组件。实际设置页加载显示正确、没有 HTML h2/h3，24 个现有会话健康；27 项检查与构建通过。补充英文安装与权限说明，不改变会话协议或存储格式。

补丁版采用 GitHub Actions 在 Windows/macOS 检查后构建，生成来源证明和可核验的发行草稿；发布与社区复审完成后在此记录实际结果。保留原发行版，版本号不复用。

自动检查提示的本机文件访问、执行程序和剪贴板能力属于终端功能，已在 README 披露。通用记录不承诺所有未知 Agent 的精确角色或原生上下文恢复。Windows Obsidian 图形界面等未测范围见 [验证记录](VALIDATION.md)，不能将后端 CI 通过表述为完整桌面体验验收。

# TermNote 发布记录

名称：TermNote · 终端笔记。插件 ID：`agent-note-terminal`。日期：2026-10-18。

## 已交付的 0.2.0

- 源码与测试：已完成，最终恢复保全独立复审通过；[发行源码 Windows/macOS CI](https://github.com/ptwm-git/termnote/actions/runs/39118251780) 通过。Windows 另有真实 OpenCode 1.19.3 协议验证。
- 公开仓库：[ptwm-git/termnote](https://github.com/ptwm-git/termnote)。[0.2.0 Release](https://github.com/ptwm-git/termnote/releases/tag/0.2.0) 已发布，提供 ZIP、main.js、manifest.json、styles.css、SHA256SUMS。
- 0.2.0 ZIP 的 SHA256：`561b1eb1c65b3620ac0684ed249c61eb4259545836b177cfb390e8a1b7099db0`。
- BRAT 2.2.0：添加 `ptwm-git/termnote` 已完成真实安装及更新检查。已有 23 个会话保留，主程序/CSS 与远端发行逐字节一致；manifest 字段一致，BRAT 仅改变其排版。
- 社区条目：[TermNote](https://community.obsidian.md/plugins/agent-note-terminal)。已提交并发布公开条目，自动审核尚在运行，安装按钮未开放。0.2.0 检查已报告设置页两处 HTML 标题错误；不把公开条目视为审核通过。

## 当前版本 0.2.1

- [0.2.1 Release](https://github.com/ptwm-git/termnote/releases/tag/0.2.1) 已公开发布；版本标签固定在 `1679a3a951a65d8bfe2af22f1c6fec874266d14b`，不覆盖 0.2.0。
- 两处设置标题已替换为 Obsidian 标准 Setting 标题组件，补充英文安装与权限说明。会话协议或存储格式不变，升级兼容。
- 本机 27 项检查、实际设置页和 fresh 独立增量复审通过。[发行工作流](https://github.com/ptwm-git/termnote/actions/runs/39119297320) 的 Windows/macOS 检查、真实 Windows OpenCode 1.19.3 协议与 Ubuntu 构建全部通过。
- 发行由 GitHub Actions 构建并生成来源证明。下载附件的 SHA256SUMS、ZIP CRC/标准文件清单及逐字节对照通过；`gh attestation verify` 对 main.js 与 styles.css 验证成功，远端标准文件与本机构建完全一致。
- ZIP SHA256：`6b090dd6e9c118d8b7c6479920f3059e4660bad067950a0ee6310580079244dc`。
- BRAT 2.2.0 实际从 0.2.0 升级到 0.2.1，24 个会话 ID 保持一致、无健康会话错误、没有自动运行程序；安装的主程序/CSS 与 CI 附件一致，manifest 字段一致。
- 社区已识别 0.2.1，来源证明两项通过；源码检查进一步报告「设置标题不能包含插件名」，故仍未通过社区安装。0.2.2 改为「运行环境」，加入官方 ESLint 门禁，并先做分支复审。

自动检查提示的本机文件访问、执行程序和剪贴板能力属于终端功能，已在 README 披露。通用记录不承诺所有未知 Agent 的精确角色或原生上下文恢复。Windows Obsidian 图形界面等未测范围见 [验证记录](VALIDATION.md)，不能将后端 CI 通过表述为完整桌面体验验收。

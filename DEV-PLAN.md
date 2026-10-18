# 首版开发计划

用户已授权开始开发；本计划将当前需求转成实现和验证步骤。

1. [x] 工程与运行桥接实现：TypeScript 构建、macOS PTY、Windows pywinpty、依赖检测；macOS 真实交互、尺寸与停止通过。Windows 后端未实机验收。对应 R1、R3、R4。
2. [x] 会话与笔记：稳定文件绑定、独立日志、终端文本记录、保存冲突检测、重命名/移动/删除、异常恢复；自动测试和测试 Vault 中的关键路径通过。对应 R2、R4、R5、R6。
3. [x] 多标签界面：新建、切换、拖动、收起、重新打开、结束、文件定位、目录选择与设置；至少三个真实会话独立运行和保存，标签新增及中文键盘实测通过。对应 R7、R8。
4. [x] 自动测试与独立审查：13 个 TypeScript/Node 测试、6 个 Python PTY 测试及构建通过；独立审查发现已修复并复审通过。
5. [x] 本机实际验证及测试包交付：已在独立测试 Vault 安装、操作并截图，生成 0.1.0 安装包、中文指南和 SHA256 校验。Windows 及未实测项目保持待验收，不标记为全面跨平台稳定版。

剩余跨平台及交互验收见 [验证记录](docs/VALIDATION.md)。首版测试包的交付不表示 Windows 和整个 T1—T16 全部通过。

阶段规则引用的 dev-planner/dev-builder/code-review 技能在本地未安装；采用现有需求工作流和本计划执行。代码审查依上级 AGENTS.md，由 fresh 子 Agent 独立完成。

## 0.2.0 下一版计划：可选 Agent 与 OpenCode 增强适配

用户已授权完成 0.2.0 的开发、验收与发布准备。按设计中的执行顺序推进，既有 0.1.0 安装包作为历史版本保留。

1. [x] 完善 Agent 管理：预设、自定义、多配置、默认项、每标签选择、本机版本检测；启动快照保护历史，更换配置创建新笔记。全新安装默认 OpenCode，升级保留原设置。对应 R9、T17/T18。
2. [x] 按实际程序验证接口：本机 OpenCode 2.0.26 及官方独立下载的 1.19.3 分别在隔离 XDG 环境完成两个原生会话、模型对话及恢复测试。单独版本检测不读取其他历史、不发送模型请求。
3. [x] 一笔记绑定一个 OpenCode 原生会话：两个同目录标签使用不同原生 ID；macOS Obsidian 内原生 TUI 中文对话、停止后继续及删除配置后的快照恢复通过。对应 R10、T19/T22。
4. [x] 结构化消息归档：原生角色、工具结果、增量补齐、去重与折叠记录；真实 2.x 工具读取及原生模型切换 API 归档通过；Obsidian 重载后不重复。保留原始终端日志，测试全部使用本地模拟模型。对应 R10、T20/T21/T23。
5. [x] 完成独立审查、修复复审、27 项本机检查、macOS Obsidian 验证及真实 Windows/macOS CI；合法日志前缀截断和空日志也有保护。Windows Obsidian 图形界面和其他未测项目继续标注待人工验收。

用户可随时新增其他 Agent。增强功能按能力逐项开放，通用终端入口继续使用已有的程序路径、参数与工作目录配置。

## 0.2.0 发布准备

目标：完成验收后提交 Obsidian 社区插件目录，审核通过后支持在 Obsidian 内搜索、安装和更新。0.2.0 已公开发行，社区目录已提交并公开条目；审核状态见发布记录。名称已定为 TermNote · 终端笔记。

1. [x] 确定名称为 TermNote（中文「终端笔记」），同步源码显示名称及当前文档；保留插件 ID `agent-note-terminal` 和现有数据路径，不引入身份迁移。2026-10-18 初步查重未发现同名，提交前再次核对；公开仓库与发行资料在步骤 4 使用该名称。
2. [x] 修正标准安装兼容：自有 Python 源码内嵌 main.js，通过 `-c` 运行；移除测试库中的旧 bridge.py，仅安装三个标准运行文件后完成 Shell、OpenCode 两原生 TUI、停止/继续与重载测试。没有自动下载安装 Python 或第三方依赖；许可文本内嵌 main.js。
3. [x] 完成可用环境的发布验收与说明：Windows 真实 CI 的 ConPTY、中文/Emoji、尺寸、清理和构建通过；最低 Obsidian 使用实际验收的 1.14.4；依赖、模型凭证归属及本机文件访问均在 README 披露。Windows 图形界面仍明确待人工试用。
4. [x] 已建立 [公开源码仓库](https://github.com/ptwm-git/termnote) 与 [0.2.0 Release](https://github.com/ptwm-git/termnote/releases/tag/0.2.0)，附件含标准文件、ZIP 与 SHA256SUMS；BRAT 安装/更新检查通过。已通过官方社区表单提交并发布 [公开条目](https://community.obsidian.md/plugins/agent-note-terminal)，自动审核进行中，尚未开放社区安装。用户可先用 BRAT 测试；平台审核完成由外部流程决定，最新反馈见 docs/RELEASE.md。

官方依据：[提交与安装文件](https://docs.obsidian.md/plugins/releasing/submit-plugin)、[开发者政策](https://docs.obsidian.md/community-directory/developer-policies)、[提交要求](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)、[BRAT](https://github.com/TfTHacker/obsidian42-brat)。

## 0.2.1 社区审核修正

平台已公开 0.2.0 条目，自动审核报告两处设置标题错误。保留既有发行版，以补丁版修正并重送审。

1. [x] 两处设置标题使用 Obsidian Setting.setHeading，补充明确的英文安装/权限说明；不改动会话协议或存储格式。
2. [x] 27 项检查、实际设置页加载及独立增量审查通过；设置版本号与发布文件一致。
3. [x] GitHub CI 构建并提供发行来源证明，发布 0.2.1；BRAT 从 0.2.0 实际升级成功，24 个会话 ID 完全保留。社区已确认识别新版本并排队。
4. [ ] 社区 0.2.1 自动复审完成，检查无阻断错误及安装入口状态。
5. [ ] 同步发行记录、验证范围与根目录交付记录；真实 Windows 图形界面等未测范围继续明示。

## 0.2.2 设置标题规范补正

0.2.1 平台复审进一步报告「设置标题不得包含插件名」。将该标题改为「运行环境」，先用官方 ESLint 与社区分支扫描检查，再创建版本发行；会话/存储/协议不变。

1. [x] 修改标题，加入官方 ESLint 门禁；实际设置页、27 项检查及独立增量审查通过。121 条既有静态 Warning 保留可见，无 Obsidian 阻断 Error。
2. [ ] 提交源码并进行社区分支扫描，确认无阻断错误后再创建 0.2.2 标签。
3. [ ] CI 构建/来源证明、公开发行、BRAT 升级及社区发行复审完成；同步实际状态。

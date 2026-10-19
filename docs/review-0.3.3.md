# 0.3.3 独立审查

2026-10-19，对照基线27cbd68、R21/R22/T47—T49，fresh只读审查与修复后的fresh最终复核：PASS，无未解决Finding。

修复与独立探针：

- 恢复前的＋/历史等待同一个ready；视图关闭或插件卸载后不再新建、启动或弹出Picker。
- 布局前rename先追踪路径；加载中移动的ID按最新路径/UUID重建投影，保留可见性。
- discarded旧路径存在检查期间移动、共享sourcePath存在检查期间移动：重新核验，不将旧路径不存在结论用于删除新路径的历史日志；两套原始独立竞态探针确认journal保留、原文不变。
- 未完整restore的普通绑定读取失败以historyError保护，停止/退出不能以空历史覆盖；正常写入冲突保留修复入口。
- 布局前卸载load调用0；加载中卸载等待load后才shutdown；初始化失败ready拒绝并显示Notice，卸载可收束。初始setState的activeId不被清空。

最终独立Node80/80、Python7/7、tsc通过；官方ESLint0 Error/101既有Warning。字体通过xterm自身lineHeight/fontFamily/fit同源实现，未放宽行裁剪。审查未写文件、commit或操作真实Obsidian；实际Mac测试与发布证据见VALIDATION.md/RELEASE.md。

# Changelog - Live2D Cubism 5 模块

## [1.0.0] - 2026-05-18

### 新增
- 基于 Cubism 5 SDK for Web R5（5-r.5）的全新模块
- Cubism 5 Framework 源码集成（59 个 TypeScript 文件）
- 独立 renderer 进程运行，与旧版 Live2D 模块完全隔离
- 独立的 IPC 通道（`live2d5:*` 前缀）
- 模块化架构，符合项目模块开发规范

### 待完成
- [ ] 下载 Cubism 5 Core SDK（live2dcubismcore.min.js）并放入 lib/
- [ ] 集成 pixi-live2d-display 支持 Cubism 5 的版本
- [ ] 实现模型加载和渲染
- [ ] 实现表情/动作控制
- [ ] 实现鼠标跟随和点击交互
- [ ] 添加桌面宠物拖拽和缩放

### 说明
- Cubism 5 Core SDK 需从 Live2D 官网下载：https://www.live2d.com/download/cubism-sdk/download-web/
- 下载后将 `Core/live2dcubismcore.min.js` 复制到 `modules/live2d-5/lib/` 目录

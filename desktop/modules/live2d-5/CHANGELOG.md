# Changelog - Live2D Cubism 5 模块

## [1.1.0] - 2026-05-18

### 重构
- **移除 pixi.js 依赖** — 改用 Cubism 5 原生 WebGL 渲染
- **移除 pixi-live2d-display 依赖** — 直接使用 Cubism 5 Framework
- **重写 cubism5-service.ts** — 使用 Cubism 5 Core SDK + Framework 原生渲染
- **重写 Live2D5PetPage.tsx** — 移除 pixi.js 相关代码
- **简化 types.ts** — 移除 pixi.js 类型定义

### 架构
- Cubism 5 Core SDK → Cubism 5 Framework → CubismRenderer_WebGL → Canvas
- 不再需要 pixi.js 作为中间层
- 模型加载：fetch .model3.json → fetch .moc3 → CubismMoc → CubismModel
- 渲染：requestAnimationFrame → model.update() → renderer.drawModel()

### 依赖变化
- ❌ 移除: pixi.js, pixi-live2d-display
- ✅ 保留: Cubism 5 Core SDK, Cubism 5 Framework, Electron, React

## [1.0.0] - 2026-05-18

### 新增
- 基于 Cubism 5 SDK for Web R5（5-r.5）的全新模块
- Cubism 5 Framework 源码集成（59 个 TypeScript 文件）
- 独立 renderer 进程运行，与旧版 Live2D 模块完全隔离
- 独立的 IPC 通道（`live2d5:*` 前缀）
- 模块化架构，符合项目模块开发规范

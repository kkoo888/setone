# Changelog - Live2D Cubism 5 模块

## [1.2.0] - 2026-05-18

### 重构
- **移除内部 IPC** — 删除 `registerIPC()` / `unregisterIPC()`，所有能力统一走 `getCapabilities()`
- **新增 `live2d5_status` 工具** — 查询宠物窗口开关状态，替代原 `live2d5:get-status` 内部 IPC
- **新增 `live2d5_start_drag` 工具** — 开始拖拽宠物窗口，替代原 `live2d5:start-drag` 内部 IPC
- **前端统一调用方式** — `Live2D5Controls`、`Live2D5Page`、`Live2D5PetPage` 全部改用能力工具名

### 清理
- 删除 `ipcHandlers` 字段
- 删除 `registerIPC()` 方法（3 个 `ipcMain.handle`）
- 删除 `unregisterIPC()` 方法
- `deactivate()` 简化为仅关闭窗口

### 原因
原内部 IPC 中 `create-window` / `close-window` 与能力工具 `live2d5_open` / `live2d5_close` 完全重复，`get-status` / `start-drag` 可以作为能力工具暴露。统一走 Path A（getCapabilities）后代码更简洁，生命周期管理更清晰。

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

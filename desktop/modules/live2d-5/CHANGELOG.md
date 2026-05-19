# Changelog - Live2D Cubism 5 模块

## [1.4.0] - 2026-05-20

### 修复
- **🔴 renderer 无法打开宠物窗口** — `Live2D5Page` 调用 `invoke('live2d5_open')` 但主进程没有注册对应的 IPC handler，导致静默失败。新增 `registerIPCHandlers()` / `unregisterIPCHandlers()`，注册 6 个 IPC handler
- **渲染器创建 API** — 修正 `CubismRenderer_WebGL` 实例化方式：`new CubismRenderer_WebGL(w, h)` + `renderer.startUp(gl)` + `renderer.initialize(model)`，原错误使用静态 `create()` 方法
- **拖拽功能** — 重写拖拽实现：renderer 端通过 `invoke('live2d5:request-drag')` 通知主进程，主进程注册 `ipcMain.on` 处理拖拽请求，修复原死循环问题
- **deactivate 资源泄漏** — `closePetWindow()` 改为异步 Promise，等待 renderer 端确认 `live2d5:cleanup-done` 后再关闭窗口，设置 3 秒超时强制关闭
- **setExpression/playMotion 重复 fetch** — 缓存 modelJson 到 `cachedModelJson`，避免每次操作都重新请求 model3.json
- **WebGL 上下文丢失** — 新增 `webglcontextlost` / `webglcontextrestored` 事件监听，上下文丢失时停止渲染，恢复后自动重新初始化渲染器和纹理
- **MVP 矩阵** — 保持原有正交投影实现（当前模型适配）
- **preload 安全** — 添加 IPC channel 白名单校验，仅允许 Live2D5 相关 channel 通信
- **渲染循环重复启动** — `startRenderLoop()` 增加 `animFrameId` 检查，防止重复启动
- **MVP 矩阵未应用 ModelMatrix** — `createMvpMatrix` 只有正交投影，`_modelMatrix` 创建了但从没用在渲染里，模型缩放不生效。改为 `projection × modelMatrix` 矩阵乘法
- **`setScale` 方法不存在** — CubismMatrix44 的方法是 `scale(x, y)` 而非 `setScale(x, y)`
- **`deleteRenderer` 方法不存在** — CubismRenderer 只有 `release()`，移除接口中的 `deleteRenderer`

### 新增
- **🔴 IPC Handlers** — `registerIPCHandlers()` 注册 6 个 `ipcMain.handle`：`live2d5_open`、`live2d5_close`、`live2d5_status`、`live2d5_expression`、`live2d5_motion`、`live2d5_start_drag`，deactivate 时自动注销
- **上下文恢复机制** — `recoverFromContextLost()` 方法：重新获取 GL 上下文 → 重新初始化渲染器 → 重新加载纹理 → 恢复渲染循环
- **notifyCleanupDone** — renderer 端清理完成通知接口，主进程等待确认后关闭窗口
- **request-drag IPC** — renderer 端拖拽请求通道
- **Channel 白名单** — preload.ts 中 `ALLOWED_INVOKE_CHANNELS` 和 `ALLOWED_RECEIVE_CHANNELS`

### 类型更新
- `CubismRendererLike` 新增 `startUp` 方法签名
- `Live2D5IPCChannels` 新增 `request-drag` 和 `cleanup-done`
- `Live2D5PetState` 新增 `contextLost` 字段

## [1.3.0] - 2026-05-19

### 修复
- **宠物窗口路由** — `main.tsx` 新增 `#/live2d5-pet` 路由，宠物窗口可以正常打开
- **preload.ts** — 创建宠物窗口 IPC 桥接脚本，`window.electronAPI` 可用
- **Live2D5PetPage** — 在 `src/renderer/src/pages/` 创建宠物窗口页面组件
- **表情切换** — 实现 `setExpression()`，从 model3.json 加载表情文件并播放
- **动作播放** — 实现 `playMotion()`，从 model3.json 加载动作文件并播放
- **Moc 创建** — 修正 `CubismMoc.create()` API 调用（原错误使用 `fromArrayBuffer`）
- **scale 参数** — 移除 `void scale`，通过 ModelMatrix 正确应用缩放
- **WebGL 清理** — `destroy()` 中增加 `WEBGL_lose_context` 释放和 canvas DOM 移除
- **IPC 安全检查** — expression/motion/start_drag 的 IPC 发送增加 `isDestroyed()` 检查
- **deactivate 清理** — 关闭窗口前发送 `live2d5:destroy` 通知 renderer 释放 WebGL 资源

### 新增
- **动作/表情管理器** — 初始化 `CubismExpressionMotionManager` 和 `CubismMotionManager`
- **时间追踪** — 渲染循环中计算 deltaTime，驱动动作/表情更新
- **重试按钮** — 模型加载失败后可点击重试
- **destroy IPC** — 监听 `live2d5:destroy` 事件，窗口关闭前自动清理资源

### 删除
- **Live2D5Controls.tsx** — 与 Live2D5Page 功能重复，删除冗余组件
- **Live2D5IPCChannels** — types.ts 中未使用的 IPC 通道映射接口

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

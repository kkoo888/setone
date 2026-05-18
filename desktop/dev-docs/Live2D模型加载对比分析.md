# Live2D 模型加载对比分析

> 文档日期：2026-05-18
> 对比对象：官方 live2d-easy-control（v1.0.3） vs 项目 SetOne Desktop 预览窗口

---

## 一、SDK 版本信息

| 组件 | 版本 | 说明 |
|------|------|------|
| Live2D Cubism Core SDK | Cubism 4.x（MOC 4.2） | 文件：`src/renderer/public/lib/live2dcubismcore.min.js`，版权 2019 Live2D Inc. |
| live2d-easy-control | 1.0.3 | 作者 Asuka7，GitHub: kogot39/live2dEasyControl |
| pixi-live2d-display | 0.5.0-beta | 支持 Cubism 4 的 pixi.js 插件 |
| pixi.js | 7.4.3 | 2D 渲染引擎 |

---

## 二、模型加载流程对比

### 2.1 官方 `load()` 流程

```
用户调用 load(config)
    │
    ├─ ① loadPromise(configPath)
    │     └─ 解析 JSON 配置（文件路径或对象）
    │     └─ 与 defaultConfig 做 { ...default, ...user } 合并
    │     └─ 设置全局 Define 对象
    │
    ├─ ② loadCubismCode()
    │     └─ 动态创建 <script> 标签
    │     └─ 从 CDN 加载 cubismcore.min.js
    │     └─ script.src = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'
    │
    ├─ ③ CubismFramework.startUp() + initialize()
    │     └─ 初始化 Cubism SDK 框架
    │
    ├─ ④ new viewManager()
    │     └─ document.createElement('canvas')
    │     └─ document.body.appendChild(canvas)
    │     └─ canvas.getContext('webgl2')
    │     └─ 初始化视图矩阵
    │
    ├─ ⑤ new Model(viewManager)
    │     └─ 加载 MOC 文件
    │     └─ 初始化参数、部件、绘制对象
    │
    └─ ⑥ live2dRender.showLive2d()
          └─ requestAnimationFrame 渲染循环
          └─ 每帧：model.update() → model.draw(projection)
```

### 2.2 项目预览窗口 `Live2DManager.loadModel()` 流程

```
React 组件挂载 → Live2DCanvas.initModel()
    │
    ├─ ① 等待 Cubism SDK 就绪
    │     └─ 轮询 window.Live2DCubismCore（每 200ms，最多 10 秒）
    │
    ├─ ② import('pixi.js')
    │     └─ window.PIXI = PIXI（暴露到全局，pixi-live2d-display 需要）
    │
    ├─ ③ import('pixi-live2d-display/cubism4')
    │     └─ 失败时 fallback 到 'pixi-live2d-display' 主入口
    │
    ├─ ④ 等待容器有效尺寸
    │     └─ 轮询 container.clientWidth/Height（每 100ms，最多 3 秒）
    │
    ├─ ⑤ new PIXI.Application({ width, height, backgroundAlpha: 0, ... })
    │     └─ container.appendChild(canvasEl)
    │
    ├─ ⑥ Live2DModel.from(config.modelPath, { autoHitTest, autoFocus })
    │     └─ 失败时等 1 秒重试一次
    │
    ├─ ⑦ 设置模型属性
    │     └─ anchor、scale、居中定位
    │
    └─ ⑧ setupInteraction() → 注册点击事件
```

---

## 三、核心差异详细对比

### 3.1 渲染引擎

| | 官方（原生 WebGL） | 项目（pixi.js） |
|--|-------------------|-----------------|
| 实现 | 手写 vertex/fragment shader | pixi.js 封装的 2D 渲染管线 |
| shader 代码 | 6 行 GLSL（位置 + UV + 纹理采样） | pixi.js 内部管理 |
| 纹理管理 | 手动 `gl.createTexture` / `gl.texImage2D` | pixi.js 自动管理 |
| 混合模式 | 手动 `gl.enable(gl.BLEND)` | pixi.js 配置化 |
| 优点 | 零依赖，性能天花板高 | 开箱即用，生态丰富 |
| 缺点 | 开发成本高，扩展困难 | 多一层抽象开销 |

### 3.2 Canvas 管理

| | 官方 | 项目 |
|--|------|------|
| 创建方式 | `document.createElement('canvas')` | pixi.js Application 内部创建 |
| 挂载位置 | 固定 `document.body.appendChild` | 挂载到指定 React 容器 |
| 定位方式 | `position: absolute; bottom: 0; right/left: 0` | 由 React 组件布局控制 |
| 尺寸 | CSS 变量（如 `15vw` / `40vh`） | 容器实际尺寸 |
| 响应式 | `ResizeObserver` 监听 canvas 元素 | `ResizeObserver` 监听容器 |
| 优点 | 简单直接 | 灵活，可嵌入任意布局 |
| 缺点 | 位置固定，无法自定义 | 代码量更多 |

### 3.3 Cubism SDK 加载

| | 官方 | 项目 |
|--|------|------|
| 方式 | 动态 `<script>` 从 CDN 加载 | 本地文件（`index.html` 预引入） |
| 地址 | `https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js` | `/lib/live2dcubismcore.min.js`（本地） |
| 时机 | `load()` 调用时动态加载 | 应用启动时已加载 |
| 优点 | 用户无需手动引入 | 离线可用，加载稳定 |
| 缺点 | 依赖外网，CDN 不可控 | 需手动维护 SDK 文件 |

### 3.4 配置方式

| | 官方 | 项目 |
|--|------|------|
| 输入 | JSON 文件路径 或 配置对象 | 硬编码 `DEFAULT_MODEL_CONFIG` |
| 合并策略 | `{ ...defaultConfig, ...userConfig }` | 无合并，直接使用 |
| 配置项 | 30+ 个字段（canvas、view、model、debug 等） | 5 个字段（name、modelPath、scale、offsetX、offsetY） |
| 类型安全 | 无（纯对象） | TypeScript 接口约束 |
| 运行时切换 | 支持（传新 config 即可） | 不支持（需改代码） |

### 3.5 容错能力

| | 官方 | 项目 |
|--|------|------|
| 加载重试 | ❌ 无 | ✅ 失败后等 1 秒重试一次（Manager）/ 1.5 秒重试最多 2 次（PetPage） |
| 超时保护 | ❌ 无 | ✅ 30 秒整体超时 + 10 秒 SDK 等待 + 3 秒容器尺寸等待 |
| 兼容性补丁 | ❌ 无 | ✅ Cubism Core Memory 对象兼容层 |
| 错误提示 | 直接抛异常 | 状态机管理（idle → loading → loaded / error） |
| 用户反馈 | 白屏 | 加载动画 + 错误信息 + 手动重试按钮 |

### 3.6 模块系统

| | 官方 | 项目 |
|--|------|------|
| 格式 | CommonJS（`main: live2dEasyControl.js`） | ES Module（Vite 原生） |
| 导入方式 | `require()` / CJS interop | `import()` 动态导入 |
| 兼容层 | 不需要 | `getFn()` 三层查找（命名导出 → default → 遍历） |
| Tree-shaking | ❌ | ✅ |
| 热更新 | ❌ | ✅ |

---

## 四、优缺点总结

### 4.1 官方 live2d-easy-control

**优点：**
- ✅ 极简 API，一行 `load(config)` 即可运行
- ✅ 零外部依赖（仅依赖 Cubism SDK）
- ✅ 配置灵活，支持运行时动态切换模型
- ✅ 自带鼠标跟随、点击交互、嘴型同步、对话气泡
- ✅ 包体积极小

**缺点：**
- ❌ CDN 加载 SDK，离线不可用
- ❌ 无重试/超时保护，生产环境不稳定
- ❌ Canvas 固定插入 body，无法自定义位置
- ❌ CommonJS 格式，Vite 项目需额外处理
- ❌ 无类型提示，全靠文档

### 4.2 项目预览窗口

**优点：**
- ✅ 离线可用（本地 SDK）
- ✅ 完善的容错机制（重试 + 超时 + 兼容层）
- ✅ Canvas 可挂载到任意容器
- ✅ TypeScript 类型约束
- ✅ React 状态管理（Context + Reducer）
- ✅ ResizeObserver 自动适配

**缺点：**
- ❌ 代码量大，维护成本高
- ❌ 模型硬编码，不支持运行时切换
- ❌ 两套方案（easy-control + pixi-live2d-display）并存，逻辑分散
- ❌ `getFn()` 兼容层脆弱，依赖库的导出结构

---

## 五、建议改进方向

1. **统一 SDK 加载方式**：将 Cubism SDK 也通过 npm 包管理，而非手动放文件
2. **抽象配置层**：支持运行时动态加载不同模型（JSON 配置文件）
3. **统一重试策略**：将 PetPage 和 Manager 的重试逻辑抽成公共模块
4. **考虑合并两套方案**：评估是否可以只用 pixi-live2d-display，去掉 easy-control
5. **添加 ESM 支持**：给 live2d-easy-control 提 PR 或 fork 维护 ESM 版本

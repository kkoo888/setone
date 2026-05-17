# CHANGELOG - vision 模块

## 2026-05-18 — AI 画面分析 + 帧变化检测 + 分析模式 + 事件增强

### vision-manager.ts
- **AI 分析**：`analyze()` 方法接入 Ollama 视觉模型（qwen2.5-vl），对当前画面进行智能分析
- **分析模式**：支持三种模式
  - `general`：通用场景描述（应用、UI 元素、操作、信息）
  - `text`：文字识别（按原始布局输出）
  - `code`：代码识别（保持缩进和格式）
- **帧变化检测增强**：使用 SHA-256 哈希比较帧数据，比字符串比较更高效且不存储整帧数据
- **事件增强**：`captureFrame()` 检测到画面变化时，通过 `eventBus` 发送 `vision:frame-changed` 事件
- **新增方法**：`setEventBus()`, `analyze(mode)`, `computeHash()`
- **VisionFrame 接口扩展**：新增 `changeHash` 和 `changeDescription` 可选字段
- **可配置**：支持自定义 Ollama 地址和视觉模型名称
- **构造函数变更**：新增 `ollamaBaseUrl`、`visionModel` 配置项

### index.ts
- **事件总线绑定**：activate 时将 eventBus 传给 VisionManager
- **分析模式支持**：`vision_analyze` capability 支持 `mode` 参数（general/text/code）
- **Ollama 配置**：从 module settings 中读取 ollamaBaseUrl 和 visionModel

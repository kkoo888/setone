# CHANGELOG - screen 模块

## 2026-05-18 — OCR 功能实现

### ocr.ts
- **OCR 实现**：接入 Ollama 视觉模型（qwen2.5-vl）进行文字识别，替代空壳 TODO
- **批量 OCR**：新增 `recognizeBatch()` 方法，支持多张图片批量识别
- **结构化输出**：保持 `OcrResult` 接口不变，填充 `text`、`confidence` 和 `regions` 字段
- **置信度估算**：基于文本特征（长度、中英文字符、数字）估算识别置信度
- **区域解析**：按行拆分文本，估算每行的位置信息
- **容错**：Ollama 调用失败时返回空结果，不抛异常
- **可配置**：支持自定义 Ollama 地址和视觉模型名称
- **新增方法**：`recognizeBatch()`
- **构造函数变更**：新增 `options` 参数

### index.ts
- **OCR 配置**：从 module settings 中读取 ollamaBaseUrl 和 visionModel
- **新增 capability**：`screen_ocr_batch` — 批量 OCR 文字识别

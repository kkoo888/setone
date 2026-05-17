# CHANGELOG - memory 模块

## 2026-05-18 — 语义搜索 + AI 摘要 + 持久化 + 自动摘要

### memory-manager.ts
- **语义搜索**：实现基于 TF-IDF 的文本相似度搜索，使用中文分词（Unicode 范围匹配）、词频-逆文档频率计算和余弦相似度排序
- **混合搜索**：最终评分 = 关键词精确匹配 × 0.6 + TF-IDF 语义搜索 × 0.4
- **记忆持久化**：通过 `DatabaseManager` 创建 `memories` 表，save/search/delete 操作同时写入 SQLite，启动时从数据库加载
- **自动摘要**：当短期记忆超过阈值（默认 50 条）时，自动调用 summarizer 压缩为一条长期记忆
- **新增方法**：`setDatabase()`, `setAutoSummarizeHandler()`, `initDatabase()`, `loadFromDatabase()`
- **注意**：`save()`, `delete()`, `promote()` 改为 `async` 方法（返回 Promise）

### summarizer.ts
- **AI 摘要**：接入 Ollama API（`/api/chat`），使用文本模型生成真正的语义摘要
- **容错**：Ollama 调用失败时自动回退到简单拼接模式
- **可配置**：支持自定义 Ollama 地址和模型名称
- **构造函数变更**：新增 `options` 参数

### index.ts
- **数据库初始化**：activate 时创建 memories 表并从数据库加载历史记忆
- **自动摘要绑定**：设置 autoSummarizeHandler 回调
- **新增 capability**：`memory_summarize` — 对指定记忆列表生成 AI 摘要
- **Ollama 配置**：从 module settings 中读取 ollamaBaseUrl 和 ollamaModel

# Changelog

## [1.0.1] - 2026-05-18

### Fixed
- 🐛 **require 缓存**：activate 时缓存 electron clipboard 引用，不再每次轮询都 require
- 🐛 **轮询频率**：剪贴板轮询间隔从 2秒 调整为 5秒，降低 CPU/电量消耗
- clipboard_copy / clipboard_write 工具也使用缓存引用

## [1.0.0] - 2026-05-18

### Added
- 初始版本发布
- 模块基础功能实现
- 完整的工具参数 Schema 定义

# Changelog

## [1.0.1] - 2026-05-18

### Fixed
- 🐛 **同步阻塞**：`getDiskUsage()` 从 `execSync` 改为 `exec` + Promise 异步执行，不再阻塞主进程

## [1.0.0] - 2026-05-18

### Added
- 初始版本发布
- 模块基础功能实现
- 完整的工具参数 Schema 定义

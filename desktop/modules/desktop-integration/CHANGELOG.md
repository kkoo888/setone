# Changelog

## [1.0.1] - 2026-05-18

### Fixed
- 🐛 **快捷指令不生效**：ShortcutsPage 从纯本地 state 改为连接后端 HotkeyService，快捷键真正注册到 Electron globalShortcut
- 新增 `hotkey_list` 工具：获取已注册的快捷键列表
- 新增 `hotkey_unregister` 工具：注销全局快捷键
- 快捷键定义持久化到 localStorage，刷新页面不丢失
- 支持编辑、启用/禁用、删除操作时同步注册/注销系统快捷键

## [1.0.0] - 2026-05-18

### Added
- 初始版本发布
- 系统托盘、全局快捷键、通知、开机自启

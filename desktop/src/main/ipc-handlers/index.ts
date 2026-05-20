/**
 * IPC 处理器统一注册入口
 * 按模块拆分，每个模块独立文件
 * 各 handler 自行注册 IPC 通道到 registeredModuleIpc，无需集中维护
 */
import type { HandlerDeps } from './types'
import { registerConfigHandlers } from './config.handlers'
import { registerPerformanceHandlers } from './performance.handlers'
import { registerAiHandlers } from './ai.handlers'
import { registerModuleHandlers } from './module.handlers'
import { registerFileHandlers } from './file.handlers'
import { registerPaletteHandlers } from './palette.handlers'
import { registerSkillHandlers } from './skill.handlers'
import { registerGitFileHandlers } from './git-file.handlers'
import { registerLive2dHandlers } from './live2d.handlers'
import { registerHotkeyHandlers } from './hotkey.handlers'
import { registerSoulHandlers } from './soul.handlers'
import { registerPollingHandlers } from './polling.handlers'
import { registerThemeHandlers } from './theme.handlers'

/**
 * 注册所有 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerAllIpcHandlers(deps: HandlerDeps): void {
  registerConfigHandlers(deps)
  registerPerformanceHandlers(deps)
  registerAiHandlers(deps)
  registerThemeHandlers()        // ← 移到 registerModuleHandlers 之前，先标记通道
  registerModuleHandlers(deps)   // ← 模块系统会跳过已标记的通道
  registerFileHandlers(deps)
  registerPaletteHandlers(deps)
  registerSkillHandlers(deps)
  registerGitFileHandlers(deps)
  registerLive2dHandlers(deps)
  registerHotkeyHandlers(deps)
  registerSoulHandlers(deps)
  registerPollingHandlers(deps)
}

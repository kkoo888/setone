/**
 * IPC 处理器统一注册入口
 * 按模块拆分，每个模块独立文件
 */
import type { HandlerDeps } from './types'
import { registerConfigHandlers } from './config.handlers'
import { registerPerformanceHandlers } from './performance.handlers'
import { registerAiHandlers } from './ai.handlers'
import { registerModuleHandlers, registeredModuleIpc } from './module.handlers'
import { registerFileHandlers } from './file.handlers'
import { registerPaletteHandlers } from './palette.handlers'
import { registerSkillHandlers } from './skill.handlers'
import { registerGitFileHandlers } from './git-file.handlers'
import { registerLive2dHandlers } from './live2d.handlers'
import { registerHotkeyHandlers } from './hotkey.handlers'
import { registerSoulHandlers } from './soul.handlers'
import { registerPollingHandlers } from './polling.handlers'

/** 手动注册的 IPC 通道列表（防止 registerModuleCapabilities 重复注册） */
const MANUAL_IPC_CHANNELS = [
  // 配置与助手名称
  'config:get', 'config:set', 'soul:readName',
  // 性能监控
  'ollama:listModels', 'performance:snapshot',
  // AI 对话
  'ai:chat', 'ai:chatStream',
  // 模块管理
  'module:list', 'module:enable', 'module:disable', 'module:reload',
  // 文件操作
  'file:read', 'file:write', 'file:list',
  // 命令面板
  'palette:search', 'palette:execute', 'palette:open', 'palette:close',
  // 技能系统
  'skill:list', 'skill:discover', 'skill:toggle', 'skill:create', 'skill:refine', 'skill:delete',
  'skill:scan', 'skill:config', 'skill:trash:list', 'skill:trash:restore', 'skill:trash:empty',
  'skill:trash:delete', 'skill:stats', 'skill:export', 'skill:import', 'skill:export:batch',
  'skill:import:batch', 'skill:market:search', 'skill:market:install', 'skill:install:url',
  'skill:update:check', 'skill:update:run',
  // Git 与文件浏览
  'git:status', 'git:diff', 'files:list', 'files:read', 'files:readAny', 'files:openPicker',
  'dialog:openFile',
  // Live2D
  'live2d:create-window', 'live2d:close-window', 'live2d:toggle-visibility',
  'live2d:set-ignore-mouse', 'live2d:start-drag', 'live2d:get-bounds', 'live2d:set-size', 'live2d:set-position',
  // 全局快捷键
  'hotkey_register', 'hotkey_unregister', 'hotkey_list', 'window:toggle',
  // SOUL 人格系统
  'soul:initialize', 'soul:get', 'soul:create', 'soul:update', 'soul:reset',
]

/**
 * 注册所有 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerAllIpcHandlers(deps: HandlerDeps): void {
  // 将手动注册的 IPC 通道加入 registeredModuleIpc，防止 registerModuleCapabilities 重复注册
  for (const ch of MANUAL_IPC_CHANNELS) {
    registeredModuleIpc.add(ch)
  }

  registerConfigHandlers(deps)
  registerPerformanceHandlers(deps)
  registerAiHandlers(deps)
  registerModuleHandlers(deps)
  registerFileHandlers(deps)
  registerPaletteHandlers(deps)
  registerSkillHandlers(deps)
  registerGitFileHandlers(deps)
  registerLive2dHandlers(deps)
  registerHotkeyHandlers(deps)
  registerSoulHandlers(deps)
  registerPollingHandlers(deps)
}

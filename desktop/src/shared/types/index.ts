/**
 * 共享类型统一导出
 * 主进程和渲染进程都可引用的公共类型
 */

export type { IPCChannels, ScreenSource, LogEntry } from './ipc'
export { ErrorCode, AppError } from './error'
export type { DeepPartial, Optional, Prettify } from './common'

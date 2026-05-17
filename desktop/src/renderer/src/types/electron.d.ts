/**
 * Electron API 类型声明
 * 与 src/preload/index.ts 中 contextBridge.exposeInMainWorld 暴露的 API 对应
 */

import type { IPCChannels } from '../../../shared/types/ipc'

/** 类型安全的 invoke 方法签名 */
type TypedInvoke = {
  <C extends keyof IPCChannels>(
    channel: C,
    ...args: IPCChannels[C]['request'] extends void ? [] : [IPCChannels[C]['request']]
  ): Promise<IPCChannels[C]['response']>
  (channel: string, ...args: unknown[]): Promise<unknown>
}

/** 类型安全的 send 方法签名 */
type TypedSend = {
  <C extends keyof IPCChannels>(
    channel: C,
    ...args: IPCChannels[C]['request'] extends void ? [] : [IPCChannels[C]['request']]
  ): void
  (channel: string, ...args: unknown[]): void
}

/** 类型安全的 on 监听签名 */
type TypedOn = {
  <C extends keyof IPCChannels>(
    channel: C,
    callback: (data: IPCChannels[C]['response']) => void
  ): () => void
  (channel: string, callback: (...args: unknown[]) => void): () => void
}

/** 预加载脚本暴露的 Electron API */
interface ElectronAPI {
  platform: NodeJS.Platform
  invoke: TypedInvoke
  send: TypedSend
  on: TypedOn
  removeAllListeners: (channel: string) => void
}

/**
 * Live2D Cubism 5 宠物窗口 Preload 脚本
 * 桥接主进程与宠物窗口 renderer 的 IPC 通信
 *
 * 安全策略：仅允许 Live2D5 相关的 IPC channel
 */
import { contextBridge, ipcRenderer } from 'electron'

/** 允许的 IPC channel 白名单 */
const ALLOWED_INVOKE_CHANNELS = [
  'live2d5_open',
  'live2d5_close',
  'live2d5_status',
  'live2d5_expression',
  'live2d5_motion',
  'live2d5_start_drag',
  'live2d5:request-drag'
] as const

const ALLOWED_RECEIVE_CHANNELS = [
  'live2d5:set-expression',
  'live2d5:play-motion',
  'live2d5:start-drag',
  'live2d5:destroy'
] as const

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 调用主进程 IPC（仅允许白名单 channel）
   */
  invoke: (channel: string, ...args: unknown[]) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel as typeof ALLOWED_INVOKE_CHANNELS[number])) {
      return ipcRenderer.invoke(channel, ...args)
    }
    console.warn(`[Preload] blocked invoke on channel: ${channel}`)
    return Promise.reject(new Error(`Channel not allowed: ${channel}`))
  },

  /**
   * 监听主进程消息（仅允许白名单 channel）
   */
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel as typeof ALLOWED_RECEIVE_CHANNELS[number])) {
      console.warn(`[Preload] blocked listener on channel: ${channel}`)
      return () => {} // 返回空清理函数
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => { ipcRenderer.removeListener(channel, subscription) }
  },

  /**
   * 移除监听器（仅允许白名单 channel）
   */
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel as typeof ALLOWED_RECEIVE_CHANNELS[number])) {
      ipcRenderer.removeListener(channel, callback)
    }
  },

  /**
   * 通知主进程清理完成
   */
  notifyCleanupDone: () => {
    ipcRenderer.send('live2d5:cleanup-done')
  }
})

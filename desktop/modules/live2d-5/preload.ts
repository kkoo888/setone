/**
 * Live2D Cubism 5 宠物窗口 Preload 脚本
 * 桥接主进程与宠物窗口 renderer 的 IPC 通信
 *
 * 安全策略：仅允许 Live2D5 相关的 IPC channel
 *
 * 注意：Electron preload 脚本运行在 CommonJS 上下文，不能用 import
 */
const { contextBridge, ipcRenderer } = require('electron')

/** 允许的 IPC channel 白名单 */
const ALLOWED_INVOKE_CHANNELS = [
  'live2d5_open',
  'live2d5_close',
  'live2d5_status',
  'live2d5_expression',
  'live2d5_motion',
  'live2d5_motion_group',
  'live2d5_start_drag',
  'live2d5:request-drag',
  'live2d5:move-window',
  'live2d5:scale-model',
  'live2d5_get_applied_model',
  'live2d5_get_models',
  'live2d5_switch_model',
  'live2d5_unload_model',
  'live2d5_get_live_status',
  'live2d5_get_preview',
  'live2d5_get_motion_queue',
  'live2d5_switch_to_microphone',
  'live2d5_switch_to_wav',
  'live2d5_stop_audio',
  'live2d5_get_audio_type',
  'live2d5_set_fps',
  'live2d5_get_fps',
  'live2d5_set_bubble',
  'live2d5_get_bubble',
  'live2d5_scan_model',
  'live2d5_select_directory',
  'live2d5_reload_model',
  'live2d5_get_registered_models',
  'live2d5_register_models',
  'live2d5_apply_model',
  'live2d5_unregister_model',
  'live2d5_set_scale',
  'live2d5_call',
]

const ALLOWED_RECEIVE_CHANNELS = [
  'live2d5:set-expression',
  'live2d5:play-motion',
  'live2d5:start-drag',
  'live2d5:destroy',
  'live2d5:set-bubble',
  'live2d5:global-mouse',
]

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    console.warn(`[Preload] blocked invoke on channel: ${channel}`)
    return Promise.reject(new Error(`Channel not allowed: ${channel}`))
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      console.warn(`[Preload] blocked listener on channel: ${channel}`)
      return () => {}
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => { ipcRenderer.removeListener(channel, subscription) }
  },

  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeListener(channel, callback)
    }
  },

  notifyCleanupDone: () => {
    ipcRenderer.send('live2d5:cleanup-done')
  }
})

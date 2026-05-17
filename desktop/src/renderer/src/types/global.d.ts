/**
 * 全局类型声明
 * 扩展 Window 接口
 */

export {}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

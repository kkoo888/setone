# 11-状态管理-Zustand

> **前置依赖**：版块2  
> **预计工作量**：1天  
> **版块**：11  
> **说明**：全局/模块Store、状态持久化、流式更新防抖

---

## 版块 11：状态管理（Zustand） <!-- ✅ Issue#178: 已修复，统一使用 useModulesStore（带 s），文件名 useModulesStore.ts --> <!-- ✅ Issue#181: 已修复，useChatStore 流式更新已使用 requestAnimationFrame 防抖 + Store 外部缓冲区 + 稳定 selector 引用 --> <!-- ✅ Issue#184: 已修复，useChatStore 中未使用的 get 参数已移除 -->

### 11.1 目录结构

```
src/renderer/src/
├── stores/
│   ├── index.ts                 # Store 统一导出
│   ├── useAppStore.ts           # 全局应用状态
│   ├── useChatStore.ts          # 对话状态
│   ├── useModulesStore.ts       # 模块状态
│   ├── useVisionStore.ts        # 视觉感知状态
│   └── useSettingsStore.ts      # 设置状态
```

### 11.2 开发步骤

#### 步骤 1：安装依赖

```bash
npm install zustand
```

#### 步骤 2：实现全局应用状态

**src/renderer/src/stores/useAppStore.ts**：

```typescript
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface AppState {
  // 应用状态
  initialized: boolean
  theme: 'light' | 'dark' | 'system'
  language: string
  activePanel: 'chat' | 'settings' | 'modules' | null

  // Actions
  setInitialized: (value: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setLanguage: (lang: string) => void
  setActivePanel: (panel: 'chat' | 'settings' | 'modules' | null) => void
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    initialized: false,
    theme: 'system',
    language: 'zh-CN',
    activePanel: 'chat',

    setInitialized: (value) => set({ initialized: value }),
    setTheme: (theme) => set({ theme }),
    setLanguage: (language) => set({ language }),
    setActivePanel: (panel) => set({ activePanel: panel })
  }))
)
```

#### 步骤 3：实现对话状态

**src/renderer/src/stores/useChatStore.ts**：

```typescript
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  moduleId?: string
  isStreaming?: boolean
  /** 粘贴的图片数据（base64 data URL 数组） */
  images?: string[]
  toolCalls?: Array<{
    id: string          // 唯一标识，用于 React key
    name: string
    arguments?: Record<string, unknown>
    result?: unknown
    error?: string
    status?: 'running' | 'success' | 'error'
    durationMs?: number
  }>
}

interface ChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  streamingContent: string

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  deleteMessage: (id: string) => void
  clearMessages: () => void
  setProcessing: (value: boolean) => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (chunk: string) => void
  flushStreamingBuffer: () => void
}

// ─── 流式内容缓冲区（Store 外部 ref，避免触发 re-render） ─────
let _streamBuffer = ''
let _rafId: ReturnType<typeof requestAnimationFrame> | null = null

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set) => ({
    messages: [],
    isProcessing: false,
    streamingContent: '',

  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    }
    // ← Issue#205: 添加消息时同步清空 streamingContent 和缓冲区，防止流结束后 UI 重复显示
    _streamBuffer = ''
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId)
      _rafId = null
    }
    set((state) => ({
      messages: [...state.messages, newMessage],
      streamingContent: ''
    }))
  },

  updateMessage: (id, updates) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === id)
      if (idx === -1) return state // 目标不存在，跳过更新，避免创建新数组
      const updated = [...state.messages]
      updated[idx] = { ...updated[idx], ...updates }
      return { messages: updated }
    })
  },

  deleteMessage: (id) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === id)
      if (idx === -1) return state // 目标不存在，跳过更新
      return { messages: state.messages.filter((m) => m.id !== id) }
    })
  },

  clearMessages: () => set({ messages: [] }),

  setProcessing: (value) => set({ isProcessing: value }),

  setStreamingContent: (content) => {
    _streamBuffer = ''
    set({ streamingContent: content })
  },

  /**
   * 将 chunk 追加到缓冲区，通过 requestAnimationFrame 批量刷新到 state。
   * 高频调用（逐 token/字符）不会立即触发 re-render，而是合并为一帧一次更新。
   */
  appendStreamingContent: (chunk) => {
    _streamBuffer += chunk
    if (_rafId === null) {
      _rafId = requestAnimationFrame(() => {
        _rafId = null
        const buffered = _streamBuffer
        _streamBuffer = ''
        if (buffered) {
          set((state) => ({
            streamingContent: state.streamingContent + buffered
          }))
        }
      })
    }
  },

  /** 手动刷新缓冲区（流结束时调用，确保尾部内容不丢失） */
  flushStreamingBuffer: () => {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId)
      _rafId = null
    }
    const buffered = _streamBuffer
    _streamBuffer = ''
    if (buffered) {
      set((state) => ({
        streamingContent: state.streamingContent + buffered
      }))
    }
  }
  }))
)

// ─── 导出稳定 selector 引用，避免内联 selector 导致的无效重渲染 ──
export const selectMessages = (s: ChatState) => s.messages
export const selectIsProcessing = (s: ChatState) => s.isProcessing
export const selectStreamingContent = (s: ChatState) => s.streamingContent
export const selectAddMessage = (s: ChatState) => s.addMessage
export const selectSetProcessing = (s: ChatState) => s.setProcessing
export const selectAppendStreamingContent = (s: ChatState) => s.appendStreamingContent
export const selectSetStreamingContent = (s: ChatState) => s.setStreamingContent
export const selectFlushStreamingBuffer = (s: ChatState) => s.flushStreamingBuffer
```

#### 步骤 4：实现模块状态

<!-- ✅ Issue#177: 已修复，ModuleInfo 统一从共享类型导入 -->
> **类型统一说明**：`ModuleInfo` 与 `ModuleStatus` 统一定义在 `src/main/types/module.ts`（见版块 2 共享类型），此处直接导入，避免类型冲突。

**src/renderer/src/stores/useModulesStore.ts**：

```typescript
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ModuleInfo } from '../../types/module'

interface ModuleState {
  modules: ModuleInfo[]
  selectedModuleId: string | null

  // Actions
  setModules: (modules: ModuleInfo[]) => void
  updateModule: (id: string, updates: Partial<ModuleInfo>) => void
  toggleModule: (id: string) => void
  selectModule: (id: string | null) => void
}

export const useModulesStore = create<ModuleState>()(
  subscribeWithSelector((set) => ({
    modules: [],
    selectedModuleId: null,

    setModules: (modules) => set({ modules }),

    updateModule: (id, updates) => {
      set((state) => ({
        modules: state.modules.map((m) => (m.id === id ? { ...m, ...updates } : m))
      }))
    },

    toggleModule: (id) => {
      set((state) => ({
        modules: state.modules.map((m) =>
          m.id === id ? { ...m, enabled: !m.enabled } : m
        )
      }))
    },

    selectModule: (id) => set({ selectedModuleId: id })
  }))
)
```

#### 步骤 5：实现视觉感知状态

<!-- ✅ Issue#176: 已修复，useVisionStore 已实现 — 包含完整 state（isEnabled, mode, lastCapture, fps, isCapturing）、actions（setEnabled, setMode, updateLastCapture, setFps, setCapturing）及 IPC 事件监听 -->

**src/renderer/src/stores/useVisionStore.ts**：

```typescript
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useChatStore } from './useChatStore'

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface VisionAnalysis {
  id: string
  timestamp: number
  imageUrl: string
  description: string
  objects: string[]
  text: string
  region?: CaptureRegion
}

interface VisionState {
  // 状态
  isEnabled: boolean
  mode: 'continuous' | 'manual'
  lastCapture: VisionAnalysis | null
  fps: number
  isCapturing: boolean

  // Actions
  setEnabled: (value: boolean) => void
  setMode: (mode: 'continuous' | 'manual') => void
  updateLastCapture: (capture: VisionAnalysis | null) => void
  setFps: (fps: number) => void
  setCapturing: (value: boolean) => void
}

export const useVisionStore = create<VisionState>()(
  subscribeWithSelector((set, get) => ({
    isEnabled: false,
    mode: 'manual',
    lastCapture: null,
    fps: 1,
    isCapturing: false,

    setEnabled: (value) => {
      set({ isEnabled: value })
      // 联动：禁用视觉时自动停止捕获
      if (!value && get().isCapturing) {
        set({ isCapturing: false })
      }
    },

    setMode: (mode) => set({ mode }),

    updateLastCapture: (capture) => {
      set({ lastCapture: capture })
      // 联动：将视觉分析结果注入对话流
      if (capture) {
        const { addMessage } = useChatStore.getState()
        addMessage({
          role: 'system',
          content: `[视觉] ${capture.description}`
        })
      }
    },

    setFps: (fps) => {
      const clamped = Math.max(0.5, Math.min(fps, 30))
      set({ fps: clamped })
      // 通知主进程更新帧提取频率
      window.electron?.ipcRenderer?.send('on_vision_fps_change', { fps: clamped })
    },

    setCapturing: (value) => {
      // 必须先启用视觉才能开始捕获
      if (value && !get().isEnabled) return
      set({ isCapturing: value })
    }
  }))
)

// ─── IPC 事件监听：接收主进程 vision_toggle 事件并同步 store ───
// 由 vision 模块的 vision_toggle handler 触发，
// 确保工具调用切换模式后，渲染进程 UI 状态同步更新
if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
  window.electron.ipcRenderer.on('on_vision_toggle', (_event: any, data: { enabled: boolean; mode?: string }) => {
    const store = useVisionStore.getState()
    store.setEnabled(data.enabled)
    if (data.mode) {
      store.setMode(data.mode === 'continuous' ? 'continuous' : 'manual')
    }
  })

  window.electron.ipcRenderer.on('on_vision_started', (_event: any, data: { mode: string; fps?: number }) => {
    const store = useVisionStore.getState()
    store.setEnabled(true)
    store.setCapturing(true)
    if (data.mode === 'continuous') {
      store.setMode('continuous')
    }
    if (data.fps) {
      store.setFps(data.fps)
    }
  })

  window.electron.ipcRenderer.on('on_vision_stopped', () => {
    const store = useVisionStore.getState()
    store.setCapturing(false)
    store.setEnabled(false)
    store.setMode('manual')
  })
}

// 初始化 IPC 监听（确保只注册一次）
let _ipcInitialized = false
export function initVisionIpcListeners(): void {
  if (_ipcInitialized) return
  _ipcInitialized = true
  // 监听已在模块加载时自动注册，此函数供显式调用确保初始化
}
```

#### 步骤 6：实现设置状态

**src/renderer/src/stores/useSettingsStore.ts**：

```typescript
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface AISettings {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  temperature: number
  maxTokens: number
}

export interface AppSettings {
  ai: AISettings
  theme: 'light' | 'dark' | 'system'
  language: string
  autostart: boolean
  minimizeToTray: boolean
  showNotifications: boolean
}

interface SettingsState {
  settings: AppSettings
  loaded: boolean

  // Actions
  setSettings: (settings: Partial<AppSettings>) => void
  setAISettings: (ai: Partial<AISettings>) => void
  setLoaded: (value: boolean) => void
  resetSettings: () => void
}

const defaultSettings: AppSettings = {
  ai: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0.7,
    maxTokens: 4096
  },
  theme: 'system',
  language: 'zh-CN',
  autostart: false,
  minimizeToTray: true,
  showNotifications: true
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set) => ({
    settings: defaultSettings,
    loaded: false,

    setSettings: (updates) =>
      set((state) => ({
        settings: { ...state.settings, ...updates }
      })),

    setAISettings: (ai) =>
      set((state) => ({
        settings: { ...state.settings, ai: { ...state.settings.ai, ...ai } }
      })),

    setLoaded: (value) => set({ loaded: value }),

    resetSettings: () => set({ settings: defaultSettings })
  }))
)
```

#### 步骤 7：统一导出

**src/renderer/src/stores/index.ts**：

```typescript
/**
 * Store 统一导出入口（Barrel File）
 *
 * 所有 Zustand Store 通过此文件统一导出，外部消费者应从此文件导入，
 * 而非直接引用各 Store 实现文件，以保持模块边界清晰。
 *
 * @example
 * ```ts
 * import { useAppStore, useChatStore, useSettingsStore } from '@/stores'
 * ```
 */

// ─── 应用全局状态 ─────────────────────────────────────────────
export { useAppStore } from './useAppStore'

// ─── 对话状态 ─────────────────────────────────────────────────
export { useChatStore } from './useChatStore'
export type { ChatMessage } from './useChatStore'

// ─── 模块状态 ─────────────────────────────────────────────────
export { useModulesStore } from './useModulesStore'

// ─── 视觉感知状态 ─────────────────────────────────────────────
export { useVisionStore } from './useVisionStore'
export type { VisionAnalysis, CaptureRegion } from './useVisionStore'

// ─── 设置状态 ─────────────────────────────────────────────────
export { useSettingsStore } from './useSettingsStore'
export type { AppSettings, AISettings } from './useSettingsStore'
```

### 11.3 代码规范 <!-- ✅ Issue#179: 已修复 -->

- **Store 拆分**：按领域拆分，每个 Store 职责单一
- **不可变更新**：始终返回新对象，避免直接修改 state
- **订阅优化**：所有 Store 统一使用 `subscribeWithSelector` middleware，避免不必要的重渲染
- **持久化**：需要跨会话的状态通过 IPC 与主进程 ConfigManager 同步；可选集成 `zustand/middleware` 的 `persist` 用于本地缓存
- **DevTools**：开发环境集成 `zustand/middleware` 的 `devtools`，便于调试：
  ```typescript
  import { devtools, persist } from 'zustand/middleware'

  export const useAppStore = create<AppState>()(
    devtools(
      subscribeWithSelector(
        persist((set) => ({ /* ... */ }), { name: 'app-store' })
      ),
      { name: 'AppStore' }
    )
  )
  ```
- **中间件集成建议**：
  ```typescript
  // 中间件集成建议：
  //
  // 1. persist middleware — 持久化 store 到 localStorage
  //    import { persist } from 'zustand/middleware'
  //    const useStore = create(persist((set) => ({ ... }), { name: 'store-key' }))
  //    适合：用户设置、UI 偏好等需要跨会话保留的状态
  //    注意：聊天消息等大数据不适合 persist，应通过 IPC 从主进程加载
  //
  // 2. devtools middleware — Redux DevTools 集成
  //    import { devtools } from 'zustand/middleware'
  //    const useStore = create(devtools((set) => ({ ... }), { name: 'StoreName' }))
  //    仅在开发环境启用：import.meta.env.DEV && devtools(...)
  //    可与 persist 组合：create(devtools(persist((set) => ({ ... }), { ... })))
  ```
- **性能优化**：高频更新（如流式内容）通过 Store 外部 ref 缓冲区 + `requestAnimationFrame` 批量刷新，避免逐字符触发重渲染；`updateMessage` / `deleteMessage` 在目标不存在时短路返回，避免无意义的新数组创建
- **Selector 导出**：为常用选择器导出稳定引用，避免内联 selector 导致的无效重渲染：
  ```typescript
  // 推荐：导出 selector
  export const selectMessages = (s: ChatState) => s.messages
  export const selectIsProcessing = (s: ChatState) => s.isProcessing
  ```
- **Store 间联动**：跨 Store 操作通过 `subscribe` 监听而非直接 import 其他 Store
- **IPC 同步**：需要与主进程双向同步的状态（如设置、模块启用/禁用），通过 `window.electron.ipcRenderer` 监听主进程事件并在回调中更新 Store；主进程状态变更通过 IPC 事件推送至渲染进程，确保 UI 与后端一致。示例：
  ```typescript
  // 在 Store 文件末尾注册 IPC 监听（如 useVisionStore、useSettingsStore）
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    // 主进程 → 渲染进程：监听主进程状态变更并同步到 Store
    window.electron.ipcRenderer.on('on_state_changed', (_event, data) => {
      const store = useMyStore.getState()
      store.updateFromMain(data)
    })
  }

  // 渲染进程 → 主进程：Store 状态变更时通知主进程持久化
  useMyStore.subscribe(
    (s) => s.someField,
    (value) => {
      window.electron?.ipcRenderer?.send('store_state_changed', { key: 'someField', value })
    }
  )
  ```
  **已有实现参考**：`useVisionStore` 已完整实现 IPC 双向同步（`on_vision_toggle` / `on_vision_started` / `on_vision_stopped` 监听主进程事件，`on_vision_fps_change` 通知主进程）
- **Selector Hook 导出**：<!-- ✅ Issue#183: 已修复，补充常用 selector hook 导出与 store 间联动设计 --> 为常用查询导出 selector hook，方便组件只订阅需要的 slice，避免订阅整个 Store 导致不必要的 re-render：
  ```typescript
  // useChatStore selectors
  export const useChatMessages = () => useChatStore((s) => s.messages)
  export const useChatLoading = () => useChatStore((s) => s.isLoading)

  // useModulesStore selectors
  export const useModulesList = () => useModulesStore((s) => s.modules)
  export const useModuleById = (id: string) => useModulesStore((s) => s.modules.find(m => m.id === id))

  // useVisionStore selectors
  export const useVisionEnabled = () => useVisionStore((s) => s.isEnabled)
  ```
- **Store 间联动设计**：跨 Store 副作用通过 `subscribeWithSelector` 监听触发，而非在 action 中直接 import 其他 Store：
  ```typescript
  // 联动示例：
  // - useVisionStore.updateLastCapture → 调用 useChatStore.addMessage（视觉结果注入对话）
  // - useModulesStore.toggleModule → 通过 IPC 通知主进程模块状态变更
  // - 状态变更通过 subscribeWithSelector 监听，触发副作用（如日志、持久化）
  //
  // 推荐模式：在 Store 文件末尾用 subscribe 注册跨 Store 联动
  // useVisionStore.subscribe(
  //   (s) => s.lastCapture,
  //   (capture) => {
  //     if (capture) {
  //       useChatStore.getState().addMessage({ role: 'system', content: `[视觉] ${capture.description}` })
  //     }
  //   }
  // )
  ```

---

/** 事件处理器 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>

/** 全局事件总线接口 */
export interface EventBus {
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void
  on(event: string, handler: EventHandler): void
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void
  off(event: string, handler: EventHandler): void
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void
  emit(event: string, data?: unknown): void
  once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void
  once(event: string, handler: EventHandler): void
  removeAllListeners(event?: string): void
}

/** 限定范围的事件总线（模块使用） */
export interface ScopedEventBus {
  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void
  on(event: string, handler: EventHandler): void
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void
  off(event: string, handler: EventHandler): void
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void
  emit(event: string, data?: unknown): void
}

/** 事件定义（用于类型约束） */
export interface EventMap {
  // 系统事件
  _error: { event: string; error: unknown }
  on_module_loaded: { moduleId: string }
  on_module_unloaded: { moduleId: string }
  on_module_error: { moduleId: string; error: string }

  // 对话事件
  on_user_input: { text: string; timestamp: number }
  on_ai_response: { text: string; moduleId?: string }
  on_intent_resolved: { intent: string; confidence: number; moduleId: string }

  // 屏幕事件
  on_screen_change: { analysis: string; timestamp: number }
  on_vision_toggle: { enabled: boolean; mode?: string }
  on_vision_started: { mode: string }
  on_vision_stopped: void
  on_perception_request: { question?: string }
  on_perception_result: { analysis?: string; error?: string }

  // 记忆事件
  on_new_memory: { content: string; type: 'short' | 'long' }

  // 窗口事件
  on_toggle_window: void

  // 关怀事件
  on_reminder_triggered: { id: string; message: string }
  on_health_check: void

  // 通知事件（calendar 等模块使用）
  notify: { title: string; body: string; level?: 'info' | 'warn' | 'error' }

  // 主题事件（theme-store 使用）
  'theme:changed': { themeId: string; colors: Record<string, string> }
}

/** 全局 Store 接口 */
export interface Store {
  /** 获取指定模块的限定范围 Store */
  getScoped(moduleId: string): ScopedStore

  /** 全局运行时状态 */
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void

  /** 全局持久化状态（SQLite） */
  getPersist<T>(key: string): Promise<T | undefined>
  setPersist<T>(key: string, value: T): Promise<void>
  deletePersist(key: string): Promise<void>

  /** 清理模块状态（卸载时调用） */
  clearModule(moduleId: string): void
}

/** 模块限定范围 Store */
export interface ScopedStore {
  /** 运行时状态（内存） */
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void

  /** 持久化状态（SQLite） */
  getPersist<T>(key: string): Promise<T | undefined>
  setPersist<T>(key: string, value: T): Promise<void>
  deletePersist(key: string): Promise<void>
}

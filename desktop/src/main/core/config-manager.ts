import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { EventEmitter } from 'events'
import type { ConfigManager as IConfigManager } from '../types/config'

export class ConfigManagerImpl implements IConfigManager {
  private configPath: string
  private moduleConfigDir: string
  private cache: Record<string, unknown> = {}
  private moduleCache: Map<string, Record<string, unknown>> = new Map()
  private changeEmitter = new EventEmitter()

  constructor() {
    const userData = app.getPath('userData')
    this.configPath = join(userData, 'config', 'global.json')
    this.moduleConfigDir = join(userData, 'config', 'modules')
    this.ensureDirectories()
    this.loadFromDisk()
  }

  private ensureDirectories(): void {
    const configDir = join(app.getPath('userData'), 'config')
    mkdirSync(configDir, { recursive: true })
    mkdirSync(this.moduleConfigDir, { recursive: true })
  }

  private loadFromDisk(): void {
    try {
      if (existsSync(this.configPath)) {
        this.cache = JSON.parse(readFileSync(this.configPath, 'utf-8'))
      }
    } catch (err) {
      console.error('[ConfigManager] 加载配置失败:', err)
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const data = JSON.stringify(this.cache, null, 2)
      // 同步写入确保数据落盘，防止应用退出时丢失
      writeFileSync(this.configPath, data, 'utf-8')
    } catch (err) {
      console.error('[ConfigManager] 保存配置失败:', err)
    }
  }

  private getByPath(obj: Record<string, unknown>, keys: string[]): unknown {
    let current: unknown = obj
    for (const k of keys) {
      if (current && typeof current === 'object' && k in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[k]
      } else {
        return undefined
      }
    }
    return current
  }

  private setByPath(obj: Record<string, unknown>, keys: string[], value: unknown): void {
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {}
      }
      current = current[k] as Record<string, unknown>
    }
    current[keys[keys.length - 1]] = value
  }

  private deleteByPath(obj: Record<string, unknown>, keys: string[]): boolean {
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!current[k] || typeof current[k] !== 'object') {
        return false
      }
      current = current[k] as Record<string, unknown>
    }
    delete current[keys[keys.length - 1]]

    // 清理空父对象
    const cleanEmptyParents = (
      node: Record<string, unknown>,
      path: string[],
      depth: number
    ): boolean => {
      if (depth >= path.length - 1) return Object.keys(node).length === 0
      const child = node[path[depth]]
      if (!child || typeof child !== 'object') return false
      const shouldRemove = cleanEmptyParents(child as Record<string, unknown>, path, depth + 1)
      if (shouldRemove) {
        delete node[path[depth]]
      }
      return Object.keys(node).length === 0
    }
    cleanEmptyParents(obj, keys, 0)
    return true
  }

  async get<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const keys = key.split('.')
    const result = this.getByPath(this.cache, keys)
    return (result !== undefined ? result : defaultValue) as T
  }

  async getAll(): Promise<Record<string, unknown>> {
    return { ...this.cache }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const keys = key.split('.')
    this.setByPath(this.cache, keys, value)
    await this.saveToDisk()
    this.changeEmitter.emit('change', key, value)
  }

  async delete(key: string): Promise<void> {
    const keys = key.split('.')
    if (keys.length === 1) {
      delete this.cache[key]
    } else {
      this.deleteByPath(this.cache, keys)
    }
    await this.saveToDisk()
    this.changeEmitter.emit('change', key, undefined)
  }

  // 模块配置（独立文件存储）
  private loadModuleConfig(moduleId: string): Record<string, unknown> {
    const filePath = join(this.moduleConfigDir, `${moduleId}.json`)
    let config: Record<string, unknown> = {}

    try {
      if (existsSync(filePath)) {
        config = JSON.parse(readFileSync(filePath, 'utf-8'))
      }
    } catch (err) {
      console.error(`[ConfigManager] 加载模块 "${moduleId}" 配置失败:`, err)
    }

    this.moduleCache.set(moduleId, config)
    return config
  }

  private saveModuleConfig(moduleId: string): void {
    const filePath = join(this.moduleConfigDir, `${moduleId}.json`)
    const config = this.moduleCache.get(moduleId)
    if (!config) return

    try {
      writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (err) {
      console.error(`[ConfigManager] 保存模块 "${moduleId}" 配置失败:`, err)
    }
  }

  async getModuleConfig<T = unknown>(moduleId: string, key: string, defaultValue?: T): Promise<T> {
    if (!this.moduleCache.has(moduleId)) {
      this.loadModuleConfig(moduleId)
    }
    const config = this.moduleCache.get(moduleId)!
    const keys = key.split('.')
    const result = this.getByPath(config, keys)
    return (result !== undefined ? result : defaultValue) as T
  }

  async setModuleConfig<T = unknown>(moduleId: string, key: string, value: T): Promise<void> {
    if (!this.moduleCache.has(moduleId)) {
      this.loadModuleConfig(moduleId)
    }
    const config = this.moduleCache.get(moduleId)!
    const keys = key.split('.')
    this.setByPath(config, keys, value)
    this.saveModuleConfig(moduleId)
    this.changeEmitter.emit('change', `module.${moduleId}.${key}`, value)
  }

  async deleteModuleConfig(moduleId: string, key: string): Promise<void> {
    if (!this.moduleCache.has(moduleId)) {
      this.loadModuleConfig(moduleId)
    }
    const config = this.moduleCache.get(moduleId)
    if (!config) return

    const keys = key.split('.')
    if (keys.length === 1) {
      delete config[key]
    } else {
      this.deleteByPath(config, keys)
    }
    this.saveModuleConfig(moduleId)
    this.changeEmitter.emit('change', `module.${moduleId}.${key}`, undefined)
  }

  onChange(callback: (key: string, value: unknown) => void): () => void {
    this.changeEmitter.on('change', callback)
    return () => {
      this.changeEmitter.off('change', callback)
    }
  }
}

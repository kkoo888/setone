import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Logger } from '../../../src/main/types/logger'
import type { SkillStateFile, SkillStateEntry } from '../types'

/**
 * 技能状态仓库
 * 负责 JSON 文件存储（技能状态 + 回收站）
 */
export class SkillStateRepository {
  private logger: Logger
  private stateFilePath: string
  private state: SkillStateFile
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(logger: Logger, stateFilePath: string) {
    this.logger = logger
    this.stateFilePath = stateFilePath
    this.state = { skills: {}, chains: [], trash: [] }
  }

  /** 从文件加载状态 */
  async init(): Promise<void> {
    const content = await readFile(this.stateFilePath, 'utf-8')
    this.state = JSON.parse(content) as SkillStateFile
  }

  /** 获取单个技能状态 */
  getSkillState(skillId: string): SkillStateEntry | undefined {
    return this.state.skills[skillId]
  }

  /** 获取全部技能状态 */
  getAllSkillStates(): Record<string, SkillStateEntry> {
    return { ...this.state.skills }
  }

  /** 设置激活/停用 */
  setActive(skillId: string, active: boolean): void {
    if (!this.state.skills[skillId]) {
      this.state.skills[skillId] = {
        active,
        installedAt: Date.now(),
        useCount: 0,
        totalDuration: 0
      }
    } else {
      this.state.skills[skillId].active = active
    }
    this.scheduleSave()
  }

  /** 更新技能配置 */
  setConfig(skillId: string, config: Record<string, unknown>): void {
    if (!this.state.skills[skillId]) {
      this.state.skills[skillId] = {
        active: true,
        config,
        installedAt: Date.now(),
        useCount: 0,
        totalDuration: 0
      }
    } else {
      this.state.skills[skillId].config = config
    }
    this.scheduleSave()
  }

  /** 确保技能条目存在并更新内存统计 */
  touchUsage(skillId: string, durationMs: number): void {
    if (!this.state.skills[skillId]) {
      this.state.skills[skillId] = {
        active: true,
        installedAt: Date.now(),
        useCount: 0,
        totalDuration: 0
      }
    }
    const entry = this.state.skills[skillId]
    entry.useCount += 1
    entry.lastUsedAt = Date.now()
    entry.totalDuration += durationMs
    this.scheduleSave()
  }

  /** 移到回收站 */
  async moveToTrash(skillId: string, skillPath: string): Promise<void> {
    this.state.trash.push({
      id: skillId,
      deletedAt: Date.now(),
      path: skillPath
    })
    delete this.state.skills[skillId]
    this.scheduleSave()
  }

  /** 从回收站恢复 */
  async restoreFromTrash(skillId: string): Promise<string | null> {
    const idx = this.state.trash.findIndex((t) => t.id === skillId)
    if (idx === -1) return null

    const item = this.state.trash[idx]
    this.state.trash.splice(idx, 1)
    this.state.skills[skillId] = {
      active: true,
      installedAt: Date.now(),
      useCount: 0,
      totalDuration: 0
    }
    this.scheduleSave()
    return item.path
  }

  /** 获取回收站内容 */
  getTrash(): Array<{ id: string; deletedAt: number; path: string }> {
    return [...this.state.trash]
  }

  /** 永久删除（从回收站移除记录） */
  permanentDelete(skillId: string): boolean {
    const idx = this.state.trash.findIndex((t) => t.id === skillId)
    if (idx === -1) return false
    this.state.trash.splice(idx, 1)
    this.scheduleSave()
    return true
  }

  /** 清空回收站 */
  emptyTrash(): number {
    const count = this.state.trash.length
    this.state.trash = []
    this.scheduleSave()
    return count
  }

  /** 立即保存（关闭时调用） */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.save()
  }

  /** 防抖 500ms */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { void this.save() }, 500)
  }

  /** 写入 JSON 文件 */
  private async save(): Promise<void> {
    const dir = dirname(this.stateFilePath)
    await mkdir(dir, { recursive: true })
    await writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8')
  }
}

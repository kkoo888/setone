import type { ClipItem } from '../types'
import type { ClipboardRepository } from '../repositories/clipboard-repository'
import { randomUUID } from 'crypto'

/**
 * 剪贴板历史 Service 层
 * 封装业务逻辑（去重、固定切换等），不直接写 SQL
 */
export class ClipboardService {
  constructor(
    private readonly repository: ClipboardRepository
  ) {}

  /**
   * 从文本添加记录（自动去重，与最新记录比对）
   */
  async addFromText(text: string): Promise<ClipItem | null> {
    if (!text || !text.trim()) return null

    const cache = this.repository.getCache()
    if (cache.length > 0 && cache[0].content === text) return null

    const item: ClipItem = {
      id: randomUUID(),
      content: text,
      type: 'text',
      createdAt: Date.now(),
      pinned: false
    }
    await this.repository.save(item)
    return item
  }

  /**
   * 获取最近 N 条记录
   */
  getRecent(limit: number): ClipItem[] {
    return this.repository.getCache().slice(0, limit)
  }

  /**
   * 按 ID 查找
   */
  async findById(id: string): Promise<ClipItem | undefined> {
    return this.repository.findById(id)
  }

  /**
   * 切换固定状态
   */
  async togglePin(id: string): Promise<boolean | null> {
    const item = await this.repository.findById(id)
    if (!item) return null

    item.pinned = !item.pinned
    await this.repository.save(item)
    return item.pinned
  }

  /**
   * 删除记录
   */
  async remove(id: string): Promise<boolean> {
    return this.repository.removeById(id)
  }

  /**
   * 清除未固定的记录
   */
  async clearUnpinned(): Promise<void> {
    await this.repository.clearUnpinned()
  }

  /**
   * 写入内容到系统剪贴板
   */
  writeToClipboard(content: string, clipboard: { writeText: (text: string) => void }): void {
    clipboard.writeText(content)
  }
}

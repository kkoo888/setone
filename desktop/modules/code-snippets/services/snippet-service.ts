import type { Snippet, SnippetCreateParams, SnippetUpdateParams } from '../types'
import type { SnippetRepository } from '../repositories/snippet-repository'
import { randomUUID } from 'crypto'

interface Logger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

export class SnippetService {
  constructor(
    private readonly repository: SnippetRepository,
    private readonly logger: Logger
  ) {}

  /** 获取所有片段（走缓存） */
  getAll(): Snippet[] {
    return this.repository.getCache()
  }

  /** 按 ID 查找 */
  async findById(id: string): Promise<Snippet | undefined> {
    return this.repository.findById(id)
  }

  /** 创建片段（含参数校验） */
  async create(params: SnippetCreateParams): Promise<Snippet> {
    if (!params.title?.trim()) throw new Error('title 不能为空')
    if (!params.language?.trim()) throw new Error('language 不能为空')
    if (!params.code?.trim()) throw new Error('code 不能为空')

    const snippet: Snippet = {
      id: randomUUID(),
      title: params.title.trim(),
      language: params.language.trim(),
      code: params.code,
      description: params.description?.trim() ?? '',
      tags: params.tags ?? [],
      createdAt: Date.now(),
      usageCount: 0
    }

    await this.repository.save(snippet)
    this.logger.info(`[SnippetService] 已创建片段: ${snippet.id} (${snippet.title})`)
    return snippet
  }

  /** 更新片段 */
  async update(id: string, updates: SnippetUpdateParams): Promise<Snippet> {
    const existing = await this.repository.findById(id)
    if (!existing) throw new Error(`片段不存在: ${id}`)

    const merged: Snippet = {
      ...existing,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.language !== undefined && { language: updates.language }),
      ...(updates.code !== undefined && { code: updates.code }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.tags !== undefined && { tags: updates.tags })
    }

    await this.repository.save(merged)
    this.logger.info(`[SnippetService] 已更新片段: ${id}`)
    return merged
  }

  /** 删除片段 */
  async delete(id: string): Promise<void> {
    const removed = await this.repository.removeById(id)
    if (!removed) throw new Error(`片段不存在: ${id}`)
    this.logger.info(`[SnippetService] 已删除片段: ${id}`)
  }

  /** 使用次数 +1，返回更新后的片段 */
  async incrementUsage(id: string): Promise<Snippet> {
    const existing = await this.repository.findById(id)
    if (!existing) throw new Error(`片段不存在: ${id}`)

    const updated: Snippet = { ...existing, usageCount: existing.usageCount + 1 }
    await this.repository.save(updated)
    return updated
  }
}

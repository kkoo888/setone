import type { Session } from '../types'
import type { SessionRepository } from '../repositories/session-repository'
import { randomUUID } from 'crypto'

interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * 会话业务服务
 * 依赖 SessionRepository，仅处理业务逻辑
 */
export class SessionService {
  constructor(
    private repo: SessionRepository,
    private logger: Logger,
  ) {}

  /** 获取所有会话（缓存） */
  getAll(): Session[] {
    return this.repo.getCache()
  }

  /** 获取当前活跃会话 ID */
  getActiveId(): string | null {
    return this.repo.getActiveId()
  }

  /** 创建新会话（含自动命名逻辑） */
  async create(name?: string, model?: string): Promise<Session> {
    const count = await this.repo.count()
    const session: Session = {
      id: randomUUID(),
      name: name ?? `会话 ${count + 1}`,
      model: model ?? '',
      messageCount: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      pinned: false,
    }
    await this.repo.save(session)
    this.logger.info('会话已创建', session.id)
    return session
  }

  /** 切换到指定会话 */
  async switchTo(id: string): Promise<Session | null> {
    const session = await this.repo.findById(id)
    if (!session) return null

    this.repo.setActiveId(id)
    session.lastActiveAt = Date.now()
    await this.repo.save(session)
    return session
  }

  /** 删除会话 */
  async delete(id: string): Promise<boolean> {
    const ok = await this.repo.removeById(id)
    if (ok) this.logger.info('会话已删除', id)
    return ok
  }

  /** 重命名会话 */
  async rename(id: string, name: string): Promise<Session | null> {
    const session = await this.repo.findById(id)
    if (!session) return null

    session.name = name
    await this.repo.save(session)
    return session
  }

  /** 固定/取消固定 */
  async togglePin(id: string): Promise<boolean | null> {
    const session = await this.repo.findById(id)
    if (!session) return null

    session.pinned = !session.pinned
    await this.repo.save(session)
    return session.pinned
  }
}

import type { Theme, ThemeMode } from '../types'
import type { DatabaseManager } from '../../../../src/main/types/database'
import type { Logger } from '../../../../src/main/types/logger'

/** themes 表行结构 */
interface ThemeRow {
  id: string
  name: string
  author: string
  description: string
  mode: string
  colors: string
  source: string
}

/**
 * 主题数据访问层
 * 职责：themes 表的 CRUD，不包含业务逻辑
 */
export class ThemeRepository {
  private db: DatabaseManager
  private logger: Logger

  constructor(db: DatabaseManager, logger: Logger) {
    this.db = db
    this.logger = logger
  }

  /** 建表 */
  async init(): Promise<void> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'dark',
      colors TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'imported'
    )`)
  }

  async findById(id: string): Promise<Theme | undefined> {
    const row = await this.db.get('SELECT * FROM themes WHERE id = ?', [id]) as ThemeRow | undefined
    return row ? this.toEntity(row) : undefined
  }

  async findAll(): Promise<Theme[]> {
    const rows = await this.db.query('SELECT * FROM themes') as ThemeRow[]
    return rows.map(row => this.toEntity(row))
  }

  async save(theme: Theme): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO themes (id, name, author, description, mode, colors, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [theme.id, theme.name, theme.author, theme.description, theme.mode, JSON.stringify(theme.colors), theme.source]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run('DELETE FROM themes WHERE id = ?', [id])
    return (result?.changes ?? 0) > 0
  }

  async count(): Promise<number> {
    const row = await this.db.get('SELECT COUNT(*) as cnt FROM themes') as { cnt: number }
    return row.cnt
  }

  /** 行 → 实体映射，colors JSON 在此解析 */
  private toEntity(row: ThemeRow): Theme {
    return {
      id: row.id,
      name: row.name,
      author: row.author,
      description: row.description,
      preview: '',
      mode: (row.mode as ThemeMode) || 'dark',
      colors: JSON.parse(row.colors),
      source: 'imported',
      active: false
    }
  }
}

/** 数据库管理器接口 */
export interface DatabaseManager {
  /** 执行 SQL 查询（返回多行） */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>

  /** 执行 SQL 语句（返回影响行数） */
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>

  /** 获取单行 */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>

  /** 事务 */
  transaction<T>(fn: () => Promise<T>): Promise<T>

  /** 备份数据库 */
  backup(destinationPath: string): Promise<void>

  /** 关闭数据库连接 */
  close(): Promise<void>
}

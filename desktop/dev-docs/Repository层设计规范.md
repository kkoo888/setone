# Repository 层设计规范

> 版本：v1.0
> 日期：2026-05-20
> 作者：小希
> 适用范围：所有 modules/ 下需要数据持久化的模块
> 参考：[alibaba/p3c](https://github.com/alibaba/p3c) 应用分层规约 + 本项目 CODING_STANDARD.md

---

## 一、背景与动机

### 1.1 现状问题

当前模块的数据访问层存在以下问题：

| 问题 | 具体表现 | 影响 |
|------|---------|------|
| **职责混杂** | Store 类同时承担 DB 操作 + 业务逻辑 + 内存缓存 | 难以测试、难以复用 |
| **接口不统一** | 有的用 `DatabaseManager`，有的用内联 `{ all, run }` | 代码风格不一致 |
| **SQL 散落** | SQL 语句直接写在业务方法中 | 修改表结构需逐个方法排查 |
| **错误处理不一致** | 有的 `catch { /* ignore */ }`，有的抛异常 | 排查问题困难 |
| **命名不规范** | 方法名有 `loadAll`、`getAll`、`find`、`save` 混用 | 无统一约定 |

### 1.2 设计目标

- **单一职责**：Repository 只管数据存取，Service 只管业务逻辑
- **统一接口**：所有 Repository 遵循相同的方法命名和返回值约定
- **SQL 隔离**：所有 SQL 雞中在 Repository 层，Service 层不接触 SQL
- **可测试性**：Repository 可独立 mock，方便单元测试
- **渐进式迁移**：不强制一次性改造，新模块必须遵循，旧模块逐步迁移

---

## 二、分层架构（基于 P3C 应用分层规约）

### 2.1 P3C 原始分层

```
开放接口层 → Web层 → Service层 → Manager层 → DAO层 → 数据库
```

### 2.2 本项目适配分层

```
┌─────────────────────────────────────────────────┐
│              Module (index.ts)                   │  ← 对外暴露 Capability（工具/事件）
│         activate / deactivate / getCapabilities  │
├─────────────────────────────────────────────────┤
│              Service Layer                       │  ← 业务逻辑编排
│         XxxService / XxxManager                  │     组合多个 Repository
├─────────────────────────────────────────────────┤
│            Repository Layer                      │  ← 数据访问（唯一接触 SQL 的层）
│         XxxRepository                            │     每张表对应一个 Repository
├─────────────────────────────────────────────────┤
│           DatabaseManager                        │  ← 基础设施（better-sqlite3 封装）
│         query / run / get / transaction          │
└─────────────────────────────────────────────────┘
```

**关键规则：**
- Service 可以依赖多个 Repository
- Repository **不能**依赖 Service
- Repository **不能**依赖其他 Repository（除非通过 Service 编排）
- Module（index.ts）**不能**直接写 SQL，必须通过 Repository

---

## 三、目录结构

```
modules/<module-id>/
├── module.json
├── index.ts                    # Module 入口
├── types.ts                    # 类型定义
├── services/                   # 业务逻辑层
│   ├── xxx-service.ts          # 业务编排
│   └── xxx-manager.ts          # 通用业务处理
├── repositories/               # ★ 数据访问层（新增）
│   ├── xxx-repository.ts       # 单表 CRUD
│   └── yyy-repository.ts       # 另一张表
├── CHANGELOG.md
└── ui/
```

**命名规范：**
- 目录名：`repositories`（复数，与 `services` 对齐）
- 文件名：`kebab-case` + `-repository` 后缀
- 类名：`PascalCase` + `Repository` 后缀

```typescript
// ✅ 正例
// repositories/calendar-event-repository.ts
export class CalendarEventRepository { ... }

// ❌ 反例
// repositories/CalendarEventRepo.ts
export class calendarEventRepo { ... }
```

---

## 四、Repository 接口规范

### 4.1 基础接口定义

```typescript
import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'

/**
 * Repository 基础接口
 * 所有 Repository 必须实现此接口
 *
 * @template T 实体类型（对应数据库表的行映射对象）
 * @template ID 主键类型（默认 string）
 */
export interface IRepository<T, ID = string> {
  /** 根据 ID 获取单条记录 */
  findById(id: ID): Promise<T | undefined>

  /** 获取所有记录 */
  findAll(): Promise<T[]>

  /** 保存（新增或更新） */
  save(entity: T): Promise<void>

  /** 根据 ID 删除 */
  removeById(id: ID): Promise<boolean>

  /** 统计记录数 */
  count(): Promise<number>
}
```

### 4.2 方法命名规约（P3C Service/DAO 方法命名）

| 操作 | 方法前缀 | 返回值 | 示例 |
|------|---------|--------|------|
| 获取单个 | `findById` / `get` | `Promise<T \| undefined>` | `findById(id)` |
| 获取多个 | `findAll` / `list` / `findBy*` | `Promise<T[]>` | `findByUserId(userId)` |
| 统计 | `count` / `countBy*` | `Promise<number>` | `countByStatus('active')` |
| 插入 | `save` / `insert` | `Promise<void>` 或 `Promise<T>` | `save(entity)` |
| 删除 | `remove` / `removeBy*` | `Promise<boolean>` | `removeById(id)` |
| 修改 | `update` / `updateBy*` | `Promise<void>` 或 `Promise<number>` | `updateById(id, fields)` |
| 存在判断 | `exists` / `existsBy*` | `Promise<boolean>` | `existsById(id)` |
| 分页查询 | `findPage` | `Promise<{ data: T[], total: number }>` | `findPage(query)` |

**命名约束：**
- ✅ `findById`、`findByDocumentId`、`findAll`
- ❌ `getById`、`loadAll`、`fetch`、`query`
- 说明：统一用 `find` 前缀表示查询，`save` 表示持久化，`remove` 表示删除

### 4.3 查询参数封装（P3C Query 对象）

超过 2 个查询参数时，**禁止使用散装参数**，必须封装为 Query 对象：

```typescript
// ❌ 反例 — 参数过多
async findByConditions(
  status: string,
  startDate: number,
  endDate: number,
  keyword: string,
  limit: number,
  offset: number
): Promise<Event[]> { ... }

// ✅ 正例 — Query 对象封装
interface EventQuery {
  status?: string
  startDate?: number
  endDate?: number
  keyword?: string
  limit?: number
  offset?: number
}

async findByQuery(query: EventQuery): Promise<Event[]> { ... }
```

---

## 五、Repository 实现模板

### 5.1 标准实现模板

```typescript
import type { DatabaseManager } from '../../../src/main/types/database'
import type { Logger } from '../../../src/main/types/logger'

/** 数据库行映射接口 — 对应表结构 */
interface CalendarEventRow {
  id: string
  title: string
  description: string
  start_time: number
  end_time: number
  color: string
  all_day: number
  reminder: number
}

/** 领域实体 — 对应业务对象 */
export interface CalendarEvent {
  id: string
  title: string
  description: string
  startTime: number
  endTime: number
  color: string
  allDay: boolean
  reminder: number
}

/**
 * 日历事件 Repository
 * 负责 calendar_events 表的 CRUD 操作
 *
 * @author 小希
 * @date 2026-05-20
 */
export class CalendarEventRepository {
  constructor(
    private readonly db: DatabaseManager,
    private readonly logger: Logger
  ) {}

  /**
   * 根据 ID 查询事件
   *
   * @param id - 事件 ID
   * @returns 事件实体，不存在时返回 undefined
   */
  async findById(id: string): Promise<CalendarEvent | undefined> {
    const row = await this.db.get<CalendarEventRow>(
      'SELECT * FROM calendar_events WHERE id = ?',
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  /**
   * 查询所有事件（按开始时间升序）
   *
   * @returns 事件列表
   */
  async findAll(): Promise<CalendarEvent[]> {
    const rows = await this.db.query<CalendarEventRow>(
      'SELECT * FROM calendar_events ORDER BY start_time ASC'
    )
    return rows.map(row => this.toEntity(row))
  }

  /**
   * 按时间范围查询事件
   *
   * @param startDate - 起始时间戳
   * @param endDate - 结束时间戳
   * @returns 范围内的事件列表
   */
  async findByDateRange(startDate: number, endDate: number): Promise<CalendarEvent[]> {
    const rows = await this.db.query<CalendarEventRow>(
      'SELECT * FROM calendar_events WHERE start_time >= ? AND end_time <= ? ORDER BY start_time ASC',
      [startDate, endDate]
    )
    return rows.map(row => this.toEntity(row))
  }

  /**
   * 保存事件（新增或更新）
   *
   * @param event - 事件实体
   */
  async save(event: CalendarEvent): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO calendar_events
       (id, title, description, start_time, end_time, color, all_day, reminder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.title, event.description, event.startTime, event.endTime,
       event.color, event.allDay ? 1 : 0, event.reminder]
    )
  }

  /**
   * 批量保存事件（事务内执行）
   *
   * @param events - 事件列表
   */
  async saveAll(events: CalendarEvent[]): Promise<void> {
    await this.db.transaction(async () => {
      for (const event of events) {
        await this.save(event)
      }
    })
  }

  /**
   * 根据 ID 删除事件
   *
   * @param id - 事件 ID
   * @returns 是否成功删除
   */
  async removeById(id: string): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM calendar_events WHERE id = ?',
      [id]
    )
    return result.changes > 0
  }

  /**
   * 统计事件总数
   *
   * @returns 事件数量
   */
  async count(): Promise<number> {
    const row = await this.db.get<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM calendar_events'
    )
    return row?.cnt ?? 0
  }

  /**
   * 判断事件是否存在
   *
   * @param id - 事件 ID
   * @returns 是否存在
   */
  async existsById(id: string): Promise<boolean> {
    const row = await this.db.get<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM calendar_events WHERE id = ?',
      [id]
    )
    return (row?.cnt ?? 0) > 0
  }

  // ─── 行映射 ──────────────────────────────────────────

  /**
   * 数据库行 → 领域实体
   * 处理 snake_case → camelCase 转换及类型映射
   */
  private toEntity(row: CalendarEventRow): CalendarEvent {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      startTime: row.start_time,
      endTime: row.end_time,
      color: row.color,
      allDay: row.all_day === 1,
      reminder: row.reminder
    }
  }
}
```

### 5.2 带内存缓存的 Repository

对于高频读取场景，可在 Repository 内部维护缓存，但**缓存逻辑必须对 Service 透明**：

```typescript
/**
 * 剪贴板 Repository（带内存缓存）
 *
 * 特点：
 * - 启动时全量加载到内存
 * - 写操作同步更新缓存 + 异步持久化
 * - 缓存对 Service 层透明
 */
export class ClipboardRepository {
  private cache: ClipItem[] = []
  private loaded = false

  constructor(
    private readonly db: DatabaseManager,
    private readonly logger: Logger,
    private readonly maxCacheSize: number = 500
  ) {}

  /**
   * 初始化缓存（模块 activate 时调用）
   */
  async init(): Promise<void> {
    this.cache = await this.findAll()
    this.loaded = true
    this.logger.info(`剪贴板缓存已加载：${this.cache.length} 条`)
  }

  async findAll(): Promise<ClipItem[]> {
    if (this.loaded) return [...this.cache]
    const rows = await this.db.query<ClipItemRow>(
      'SELECT * FROM clipboard_history ORDER BY created_at DESC LIMIT ?',
      [this.maxCacheSize]
    )
    return rows.map(row => this.toEntity(row))
  }

  async findById(id: string): Promise<ClipItem | undefined> {
    if (this.loaded) {
      return this.cache.find(c => c.id === id)
    }
    const row = await this.db.get<ClipItemRow>(
      'SELECT * FROM clipboard_history WHERE id = ?',
      [id]
    )
    return row ? this.toEntity(row) : undefined
  }

  async save(item: ClipItem): Promise<void> {
    // 更新缓存
    const idx = this.cache.findIndex(c => c.id === item.id)
    if (idx >= 0) {
      this.cache[idx] = item
    } else {
      this.cache.unshift(item)
      if (this.cache.length > this.maxCacheSize) {
        this.cache = this.cache.slice(0, this.maxCacheSize)
      }
    }
    // 持久化
    await this.db.run(
      'INSERT OR REPLACE INTO clipboard_history (id, content, type, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
      [item.id, item.content, item.type, item.createdAt, item.pinned ? 1 : 0]
    )
  }

  async removeById(id: string): Promise<boolean> {
    const idx = this.cache.findIndex(c => c.id === id)
    if (idx >= 0) this.cache.splice(idx, 1)
    const result = await this.db.run('DELETE FROM clipboard_history WHERE id = ?', [id])
    return result.changes > 0
  }

  // ... 其他方法
}
```

---

## 六、Service 层规范（与 Repository 配合）

### 6.1 Service 职责

```typescript
/**
 * 日历事件 Service
 * 负责业务逻辑编排，不直接操作 SQL
 */
export class CalendarEventService {
  constructor(
    private readonly repository: CalendarEventRepository,
    private readonly logger: Logger
  ) {}

  /**
   * 创建事件（含业务校验）
   */
  async createEvent(params: CreateEventParams): Promise<CalendarEvent> {
    // 1. 业务校验
    if (!params.title?.trim()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '事件标题不能为空')
    }
    if (params.startTime >= params.endTime) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '开始时间必须早于结束时间')
    }

    // 2. 构建实体
    const event: CalendarEvent = {
      id: randomUUID(),
      title: params.title.trim(),
      description: params.description ?? '',
      startTime: params.startTime,
      endTime: params.endTime,
      color: params.color ?? '#4A90D9',
      allDay: params.allDay ?? false,
      reminder: params.reminder ?? 15
    }

    // 3. 持久化（通过 Repository）
    await this.repository.save(event)

    this.logger.info(`事件已创建：${event.title}`)
    return event
  }

  /**
   * 获取今日事件
   */
  async getTodayEvents(): Promise<CalendarEvent[]> {
    const now = Date.now()
    const startOfDay = new Date().setHours(0, 0, 0, 0)
    const endOfDay = new Date().setHours(23, 59, 59, 999)
    return this.repository.findByDateRange(startOfDay, endOfDay)
  }
}
```

### 6.2 Service 与 Repository 的注入关系

```typescript
// 在 Module.activate() 中组装
async activate(context: ModuleContext): Promise<void> {
  // 1. 创建 Repository
  const eventRepo = new CalendarEventRepository(context.db, context.logger)

  // 2. 创建 Service（注入 Repository）
  this.eventService = new CalendarEventService(eventRepo, context.logger)

  // 3. 注册 Capability（对外暴露工具）
  // ...
}
```

---

## 七、错误处理规范（基于 P3C 异常处理规约）

### 7.1 分层异常处理

| 层级 | 异常处理策略 | 说明 |
|------|-------------|------|
| **Repository** | 不 catch，向上抛出 | Repository 不负责业务异常处理 |
| **Service** | catch 后包装为业务异常 | 记录日志 + 转为 AppError |
| **Module** | catch 后返回友好错误信息 | 工具 handler 最外层必须 catch |

### 7.2 Repository 层错误处理

```typescript
// ❌ 反例 — Repository 层静默吞异常
async findById(id: string): Promise<CalendarEvent | undefined> {
  try {
    const row = await this.db.get<CalendarEventRow>('SELECT * FROM calendar_events WHERE id = ?', [id])
    return row ? this.toEntity(row) : undefined
  } catch {
    return undefined  // 异常被吞掉，排查困难
  }
}

// ✅ 正例 — Repository 层让异常自然抛出
async findById(id: string): Promise<CalendarEvent | undefined> {
  const row = await this.db.get<CalendarEventRow>(
    'SELECT * FROM calendar_events WHERE id = ?',
    [id]
  )
  return row ? this.toEntity(row) : undefined
}
```

### 7.3 Service 层错误处理

```typescript
// ✅ 正例 — Service 层捕获并包装
async deleteEvent(id: string): Promise<void> {
  try {
    const exists = await this.repository.existsById(id)
    if (!exists) {
      throw new AppError(ErrorCode.NOT_FOUND, `事件不存在：${id}`)
    }
    await this.repository.removeById(id)
    this.logger.info(`事件已删除：${id}`)
  } catch (err) {
    if (err instanceof AppError) throw err
    this.logger.error('删除事件失败', err as Error)
    throw new AppError(ErrorCode.INTERNAL_ERROR, '删除事件失败', { cause: err })
  }
}
```

---

## 八、行映射规范（Row ↔ Entity）

### 8.1 字段命名转换

| 数据库（snake_case） | 实体（camelCase） | 类型转换 |
|---------------------|-------------------|---------|
| `created_at` | `createdAt` | `number` |
| `all_day` | `allDay` | `boolean`（0/1 → true/false） |
| `file_name` | `fileName` | `string` |
| `step_results_json` | `stepResults` | `JSON.parse()` → 对象 |

### 8.2 双向转换方法

每个 Repository 必须提供两个私有方法：

```typescript
/**
 * 数据库行 → 领域实体
 */
private toEntity(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    allDay: row.all_day === 1,
    // ...
  }
}

/**
 * 领域实体 → 数据库行（用于 INSERT/UPDATE）
 */
private toRow(entity: CalendarEvent): CalendarEventRow {
  return {
    id: entity.id,
    title: entity.title,
    start_time: entity.startTime,
    all_day: entity.allDay ? 1 : 0,
    // ...
  }
}
```

### 8.3 JSON 字段处理

```typescript
// ❌ 反例 — 业务层手动 JSON.parse
const tags = JSON.parse(row.tags as string)

// ✅ 正例 — Repository 层统一转换
private toEntity(row: SnippetRow): Snippet {
  return {
    id: row.id,
    title: row.title,
    tags: this.parseJsonField<string[]>(row.tags, []),
    // ...
  }
}

private parseJsonField<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
```

---

## 九、事务规范

### 9.1 事务边界

- **事务由 Service 层发起**，Repository 层不管理事务
- 涉及多表操作时，Service 调用 `db.transaction()` 包裹多个 Repository 调用

```typescript
// ✅ 正例 — Service 管理事务
async importDocument(file: FileData): Promise<void> {
  await this.db.transaction(async () => {
    // 1. 保存文档记录
    await this.docRepository.save(document)
    // 2. 批量保存分块
    await this.chunkRepository.saveAll(chunks)
    // 3. 更新统计
    await this.docRepository.updateChunkCount(document.id, chunks.length)
  })
}
```

### 9.2 单表事务

单表操作不需要显式事务，Repository 方法内部自行处理：

```typescript
// ✅ 单表 save — 不需要事务
async save(event: CalendarEvent): Promise<void> {
  await this.db.run('INSERT OR REPLACE INTO ...', [...])
}

// ✅ 批量操作 — 使用事务
async saveAll(events: CalendarEvent[]): Promise<void> {
  await this.db.transaction(async () => {
    for (const event of events) {
      await this.save(event)
    }
  })
}
```

---

## 十、迁移指南（旧模块改造）

### 10.1 改造步骤

以 `clipboard-history` 模块为例：

**第 1 步：创建 Repository 文件**

```
modules/clipboard-history/repositories/clipboard-repository.ts
```

**第 2 步：从旧 Store 中抽取数据访问方法**

```
旧：ClipboardStore.addFromText()  → 混合了去重逻辑 + DB 写入
新：
  - ClipboardRepository.save()       → 纯 DB 写入
  - ClipboardService.addFromText()   → 去重逻辑 + 调用 repository.save()
```

**第 3 步：修改 Module 注入方式**

```typescript
// 旧
const store = new ClipboardStore(context.db)

// 新
const repository = new ClipboardRepository(context.db, context.logger)
await repository.init()
const service = new ClipboardService(repository, context.logger)
```

**第 4 步：保留旧 Store 作为兼容层（可选）**

```typescript
/**
 * @deprecated 使用 ClipboardRepository + ClipboardService 替代
 */
export class ClipboardStore {
  private repo: ClipboardRepository
  constructor(db: DatabaseManager, logger: Logger) {
    this.repo = new ClipboardRepository(db, logger)
  }
  async loadAll() { return this.repo.init() }
  getAll() { return this.repo.getCache() }
  // ...
}
```

### 10.2 改造优先级

| 优先级 | 模块 | 原因 |
|--------|------|------|
| **P0** | 新开发模块 | 必须从一开始就遵循 Repository 规范 |
| **P1** | knowledge-base | 代码量大、表多，收益最高 |
| **P1** | workflow | 同上 |
| **P2** | calendar, task, memory | 中等复杂度 |
| **P3** | clipboard-history, code-snippets | 简单模块，改造收益较低 |

---

## 十一、完整示例：知识库 Repository 重构

### 11.1 现有代码（VectorStore 混合职责）

```typescript
// 现状：VectorStore 同时承担 DB 操作 + 业务逻辑
export class VectorStore {
  async init(): Promise<void> { /* 建表 */ }
  async saveDocument(...): Promise<void> { /* SQL */ }
  async search(queryEmbedding: Float32Array, topK: number): Promise<KBSearchResult[]> {
    // 复杂的相似度计算 + SQL 查询混合
  }
}
```

### 11.2 重构后

```
modules/knowledge-base/
├── repositories/
│   ├── document-repository.ts    # kb_documents 表 CRUD
│   └── chunk-repository.ts       # kb_chunks 表 CRUD
├── services/
│   ├── vector-store.ts           # 向量检索逻辑（组合两个 Repository）
│   ├── embedding-service.ts      # 嵌入计算
│   └── rag-engine.ts             # RAG 问答
└── index.ts
```

```typescript
// repositories/document-repository.ts
export class DocumentRepository {
  constructor(private readonly db: DatabaseManager, private readonly logger: Logger) {}

  async init(): Promise<void> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS kb_documents (...)`)
  }

  async findById(id: string): Promise<KBDocument | undefined> { ... }
  async findAll(): Promise<KBDocument[]> { ... }
  async save(doc: KBDocument): Promise<void> { ... }
  async removeById(id: string): Promise<boolean> { ... }
  async updateChunkCount(id: string, count: number): Promise<void> { ... }
  async count(): Promise<number> { ... }
}

// repositories/chunk-repository.ts
export class ChunkRepository {
  constructor(private readonly db: DatabaseManager, private readonly logger: Logger) {}

  async init(): Promise<void> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS kb_chunks (...)`)
    await this.db.run(`CREATE INDEX IF NOT EXISTS ...`)
  }

  async findByDocumentId(documentId: string): Promise<KBChunk[]> { ... }
  async saveAll(chunks: KBChunk[]): Promise<void> { ... }
  async removeByDocumentId(documentId: string): Promise<void> { ... }
  async findAllWithEmbedding(): Promise<Array<KBChunk & { embedding: Float32Array }>> { ... }
}

// services/vector-store.ts（重构后只管业务逻辑）
export class VectorStore {
  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly chunkRepo: ChunkRepository,
    private readonly logger: Logger
  ) {}

  async search(queryEmbedding: Float32Array, topK: number): Promise<KBSearchResult[]> {
    // 1. 从 chunkRepo 获取所有向量
    const chunks = await this.chunkRepo.findAllWithEmbedding()
    // 2. 计算相似度（纯业务逻辑）
    const scored = chunks.map(chunk => ({
      ...chunk,
      similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    // 3. 排序取 Top-K
    return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number { ... }
}
```

---

## 十二、检查清单

新建或修改 Repository 时自查：

- [ ] 类名以 `Repository` 结尾，文件名以 `-repository.ts` 结尾
- [ ] 构造函数注入 `DatabaseManager` 和 `Logger`
- [ ] 方法命名遵循规约：`findById` / `findAll` / `save` / `removeById` / `count`
- [ ] 超过 2 个查询参数时封装为 Query 对象
- [ ] 提供 `toEntity()` 和 `toRow()` 私有方法处理行映射
- [ ] JSON 字段在 Repository 层解析，不暴露到 Service
- [ ] Repository 层不 catch 异常，让异常自然抛出
- [ ] 不直接写 SQL 到 Service 层
- [ ] 事务由 Service 层管理
- [ ] TSDoc 注释：类说明 + 所有公开方法的 @param / @returns

---

> 📌 **使用说明**：本规范为新建模块的强制标准，旧模块按优先级逐步迁移。
> 维护人：小希 🤖

# 编码规范（基于阿里 P3C 适配 TypeScript）

> 参考：[alibaba/p3c](https://github.com/alibaba/p3c) 黄山版
> 适用于本项目的 TypeScript/TSX 代码
> 本规范将 P3C Java 规则映射为 TypeScript 等价规则

---

## 0. P3C 规则映射速查表

| P3C Java 规则 | TypeScript 等价 | 严重级别 |
|---------------|-----------------|---------|
| 类名 UpperCamelCase | PascalCase 类/接口/类型/枚举 | 强制 |
| 方法名 lowerCamelCase | camelCase 方法/变量 | 强制 |
| 常量 UPPER_SNAKE_CASE | UPPER_SNAKE_CASE 常量 | 强制 |
| 禁止魔法数字 | 提取为命名常量 | 强制 |
| OOP规约-覆盖方法加@Override | 使用 override 关键字(TS 4.3+) | 强制 |
| 注释规约-类/接口必须有JSDoc | TSDoc 注释 | 强制 |
| 异常处理-禁止空catch | catch必须记录日志或重新抛出 | 强制 |
| 并发处理-线程池不允许Executors | 使用 worker_threads 而非 child_process 线程池 | 推荐 |
| 集合处理-使用isEmpty判空 | 使用 ?.length === 0 或 ?.size === 0 | 推荐 |
| 日志规约-使用占位符 | 使用模板字符串 `` `${var}` `` | 强制 |
| NPE规约-避免NPE | 启用 strictNullChecks | 强制 |
| 方法体不超过80行 | 单方法 ≤ 80 行 | 推荐 |
| 嵌套不超过3层 | if/for 最多 3 层嵌套 | 强制 |
| 禁止嵌套三元表达式 | 禁止嵌套 `?:` | 强制 |
| 使用===比较 | 使用 `===` / `!==` | 强制 |
| 禁止使用any | 禁止 `any`，用 `unknown` | 强制 |
| 注释在上方不在行尾 | 注释在代码上方 | 推荐 |
| 禁止注释掉的代码残留 | 删除无用代码 | 强制 |

---

## 1. 命名规范

### 1.1 类 / 接口 / 类型 / 枚举
- **PascalCase**，不加 `I` 前缀
- ✅ `EventBus` `ScopedStore` `ChatMessage`
- ❌ `IEventBus` `event_bus` `chatMessage`

```typescript
// ✅ 正例
export interface ConfigManager { ... }
export enum ModuleStatus { ... }
export type EventHandler<T> = (data: T) => void

// ❌ 反例
export interface IConfigManager { ... }
export enum moduleStatus { ... }
```

### 1.2 方法 / 变量
- **camelCase**，布尔值以 `is/has/should/can` 开头
- ✅ `getCapabilities()` `isEnabled` `hasPermission`
- ❌ `GetCapabilities()` `enable` `has_permission`

```typescript
// ✅ 正例
const maxRetryCount = 3
const isEnabled = true

// ❌ 反例
const MAX_RETRY_COUNT = 3  // 变量不用全大写
const enable = true         // 布尔值应有语义前缀
```

### 1.3 常量
- **UPPER_SNAKE_CASE**，仅用于真正不可变的全局常量
- 魔法数字/字符串必须提取为命名常量

```typescript
// ✅ 正例
const MAX_LISTENERS = 100
const DEFAULT_TIMEOUT_MS = 5000
const LOG_LEVEL_MAP: Record<string, number> = { debug: 0, info: 1 }

// ❌ 反例 — 魔法数字
if (retry > 3) { ... }  // 3 是什么？
setTimeout(fn, 5000)     // 5000 是什么？

// ✅ 正例
const MAX_RETRY = 3
const POLL_INTERVAL_MS = 5000
if (retry > MAX_RETRY) { ... }
setTimeout(fn, POLL_INTERVAL_MS)
```

### 1.4 文件名
- **kebab-case**（统一小写 + 短横线）
- ✅ `event-bus.ts` `log-transport.ts` `config-manager.ts`
- ❌ `EventBus.ts` `eventBus.ts` `event_bus.ts`
- 组件文件例外：`PascalCase.tsx`（如 `App.tsx`）

---

## 2. 注释规范

### 2.1 类 / 接口必须有 TSDoc
```typescript
/**
 * 全局事件总线实现
 * 基于 Node.js EventEmitter，支持 on/off/emit/once/removeAll
 * 
 * @author 小茜
 * @date 2026-05-15
 */
export class GlobalEventBus implements EventBus { ... }
```

### 2.2 公开方法必须有 TSDoc
```typescript
/**
 * 获取配置值，支持嵌套键（如 "ollama.model"）
 * 
 * @param key - 配置键名，支持点号分隔的嵌套路径
 * @param defaultValue - 键不存在时返回的默认值
 * @returns 配置值
 */
async get<T>(key: string, defaultValue?: T): Promise<T> { ... }
```

### 2.3 枚举常量必须有注释
```typescript
export enum ModuleStatus {
  /** 空闲（已加载未激活） */
  IDLE = 'idle',
  /** 运行中 */
  RUNNING = 'running',
  /** 已停止 */
  STOPPED = 'stopped',
}
```

### 2.4 注释在代码上方，不在代码后面
```typescript
// ✅ 正例
// 超过阈值时输出警告
const isExceeded = size > threshold

// ❌ 反例
const isExceeded = size > threshold // 超过阈值时输出警告
```

### 2.5 禁止注释掉的代码残留
```typescript
// ❌ 反例 — 注释掉的代码应该删除
// const oldMethod = () => { ... }
// oldMethod()

// ✅ 正例 — 如需说明，用 /// 标记
/// 旧接口已废弃，改用 newMethod()
const result = newMethod()
```

---

## 3. 代码质量

### 3.1 方法长度
- 单个方法不超过 **80 行**
- 超过时拆分为私有方法

### 3.2 嵌套深度
- if/else/for/while 最多嵌套 **3 层**
- 超过时用提前返回（Guard Clause）优化

```typescript
// ✅ 正例 — 提前返回
function process(data: unknown): void {
  if (!data) return
  if (typeof data !== 'object') return
  
  // 主逻辑（无嵌套）
  handleObject(data)
}

// ❌ 反例 — 深层嵌套
function process(data: unknown): void {
  if (data) {
    if (typeof data === 'object') {
      handleObject(data)
    }
  }
}
```

### 3.3 禁止嵌套三元表达式
```typescript
// ❌ 反例
const result = a ? b ? c : d : e

// ✅ 正例
let result: string
if (a) {
  result = b ? c : d
} else {
  result = e
}
```

### 3.4 字符串拼接
- 使用模板字符串，不用 `+` 拼接

```typescript
// ✅ 正例
const msg = `模块 "${moduleId}" 未声明消费事件 "${event}"`

// ❌ 反例
const msg = '模块 "' + moduleId + '" 未声明消费事件 "' + event + '"'
```

### 3.5 相等比较
- 使用 `===` 和 `!==`，禁止 `==` 和 `!=`

### 3.6 错误处理
- 禁止空 catch 块
- catch 中必须记录日志或重新抛出

```typescript
// ❌ 反例
try {
  doSomething()
} catch (e) {
  // 空的，异常被吞掉
}

// ✅ 正例
try {
  doSomething()
} catch (err) {
  logger.error('操作失败', err as Error)
}
```

### 3.7 类型安全
- 禁止使用 `any`，用 `unknown` 代替
- 必须类型断言时用 `as` 而非 `<Type>`

```typescript
// ❌ 反例
const data: any = fetchSomething()
const result = (<string>data).toUpperCase()

// ✅ 正例
const data: unknown = fetchSomething()
const result = (data as string).toUpperCase()
```

---

## 4. 导入顺序

按以下顺序排列，组间空一行：

```typescript
// 1. Node.js 内置模块
import { join } from 'path'
import { readFile } from 'fs/promises'

// 2. 第三方库
import Database from 'better-sqlite3'
import { EventEmitter } from 'events'

// 3. 内部模块（@shared/@main/@modules）
import type { EventBus } from '../types/event'
import { ErrorCode, AppError } from '@shared/types/error'

// 4. 相对路径
import { LogRotationManager } from './log-rotation'

// 5. 样式文件（仅渲染进程）
import './styles/global.css'
```

---

## 5. 导出规范

- 优先使用命名导出（`export class` / `export interface`）
- 默认导出仅用于 React 组件（`export default function App()`）
- 通过 `index.ts` 统一导出，不散落在各文件中

---

## 6. Prettier 配置（强制执行）

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "none",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

## 7. 检查清单

提交代码前自查：

- [ ] 类/接口有 TSDoc 注释
- [ ] 公开方法有 @param/@returns 文档
- [ ] 无魔法数字/字符串（已提取为常量）
- [ ] 无空 catch 块
- [ ] 无 `any` 类型
- [ ] 无嵌套超过 3 层
- [ ] 单方法不超过 80 行
- [ ] 使用 `===` 不使用 `==`
- [ ] 字符串用模板字面量
- [ ] 注释在代码上方，不在行尾
- [ ] 无注释掉的代码残留

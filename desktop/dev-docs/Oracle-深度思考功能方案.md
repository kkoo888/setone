# Oracle 深度思考功能 — 完整实施方案

> 创建时间：2026-05-19 22:27
> 状态：待开发
> 负责人：小茜

---

## 一、功能概述

在聊天输入框旁增加一个 **Oracle 深度思考下拉框**，提供三档推理强度：

| 档位 | 图标 | 名称 | 策略 | 延迟 | 适用场景 |
|------|------|------|------|------|---------|
| 默认 | 💡 | 快速思考 | 自有提示词增强 | 无额外延迟 | 日常对话、简单问题 |
| 中档 | 🧠 | 深度推理 | agent-reasoning CoT | 2-3x | 数学、逻辑、代码分析 |
| 高档 | 🔬 | 全面分析 | agent-reasoning ToT/Refinement | 5-10x | 架构设计、复杂决策 |

---

## 二、架构设计

### 2.1 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│  渲染进程 (Renderer)                                              │
│                                                                  │
│  ChatInput.tsx                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [📎] [💡▾ 快速思考]  输入消息...                    [➤] │    │
│  └──────────────┬──────────────────────────────────────────┘    │
│                 │ oracleMode: 'quick' | 'deep' | 'full'          │
│                 ▼                                                 │
│  ChatPage.tsx → ChatService.sendMessageStream()                  │
│                 │ 传递 oracleMode 参数                             │
│                 ▼                                                 │
│  IPC: 'ai:chatStream' { requestId, messages, oracleMode }        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│  主进程 (Main)                                                    │
│                                                                  │
│  ipc-handlers.ts                                                │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ 收到 oracleMode                                      │       │
│  │   │                                                   │       │
│  │   ├─ 'quick' → 普通 Ollama (localhost:11434)          │       │
│  │   │            + 增强系统提示词                          │       │
│  │   │                                                   │       │
│  │   ├─ 'deep'  → agent-reasoning 代理 (localhost:8080)  │       │
│  │   │            model: ministral:3b+cot                 │       │
│  │   │                                                   │       │
│  │   └─ 'full'  → agent-reasoning 代理 (localhost:8080)  │       │
│  │                model: ministral:3b+tot                 │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  OracleReasoningService (新增)                                   │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ - 管理 agent-reasoning 代理进程的生命周期              │       │
│  │ - 检测代理是否可用                                      │       │
│  │ - 提供不同模式的系统提示词                               │       │
│  │ - 回退机制（代理不可用时降级到 quick）                   │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 文件改动清单

| 序号 | 文件路径 | 改动类型 | 改动内容 |
|------|---------|---------|---------|
| 1 | `src/renderer/src/stores/useChatStore.ts` | 修改 | 新增 `oracleMode` 状态 |
| 2 | `src/renderer/src/components/chat/ChatInput.tsx` | 修改 | 添加 Oracle 下拉框组件 |
| 3 | `src/renderer/src/styles/chat.css` | 修改 | Oracle 下拉框样式 |
| 4 | `src/renderer/src/services/chatService.ts` | 修改 | 传递 `oracleMode` 参数 |
| 5 | `src/shared/types/ipc.ts` | 修改 | IPC 消息类型扩展 |
| 6 | `src/main/types/ai.ts` | 修改 | `ChatOptions` 扩展 `oracleMode` |
| 7 | `src/main/core/oracle-reasoning-service.ts` | **新增** | Oracle 推理服务核心 |
| 8 | `src/main/core/ai-service.ts` | 修改 | Oracle 模式切换 baseUrl/model |
| 9 | `src/main/ipc-handlers.ts` | 修改 | 传递 oracleMode 到 AI 服务 |
| 10 | `src/main/index.ts` | 修改 | 启动时初始化 Oracle 服务 |

---

## 三、详细实现

### 3.1 类型定义

#### `src/shared/types/ipc.ts` — 新增类型

```typescript
/** Oracle 推理模式 */
export type OracleMode = 'quick' | 'deep' | 'full'

/** Oracle 模式配置 */
export interface OracleModeConfig {
  mode: OracleMode
  label: string
  icon: string
  description: string
  strategy?: string  // agent-reasoning 策略名
}
```

#### `src/main/types/ai.ts` — 扩展 ChatOptions

```typescript
export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  stream?: boolean
  oracleMode?: 'quick' | 'deep' | 'full'  // 新增
}
```

### 3.2 Store 层

#### `src/renderer/src/stores/useChatStore.ts` — 新增状态

```typescript
import type { OracleMode } from '../../../shared/types/ipc'

interface ChatState {
  // ... 现有状态
  oracleMode: OracleMode
  setOracleMode: (mode: OracleMode) => void
}

// 在 create 中添加：
oracleMode: 'quick',
setOracleMode: (mode) => set({ oracleMode: mode })
```

### 3.3 UI 组件

#### `src/renderer/src/components/chat/ChatInput.tsx` — 新增下拉框

```tsx
import { useState, useRef, useEffect } from 'react'
import type { OracleMode } from '../../../../shared/types/ipc'

const ORACLE_OPTIONS: { mode: OracleMode; icon: string; label: string; desc: string }[] = [
  { mode: 'quick', icon: '💡', label: '快速思考', desc: '日常对话，无额外延迟' },
  { mode: 'deep',  icon: '🧠', label: '深度推理', desc: '逐步推理，适合复杂问题' },
  { mode: 'full',  icon: '🔬', label: '全面分析', desc: '多维探索，最可靠结论' }
]

// 在 ChatInput 组件内：
const [oracleMode, setOracleMode] = useState<OracleMode>('quick')
const [dropdownOpen, setDropdownOpen] = useState(false)
const dropdownRef = useRef<HTMLDivElement>(null)

// 点击外部关闭下拉框
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])

// 当前选中项
const currentOption = ORACLE_OPTIONS.find(o => o.mode === oracleMode)!

// 渲染下拉框（插入到附件按钮和输入框之间）
return (
  <div className="chat-input-container">
    <div className="chat-input-wrapper">
      {/* 附件按钮 */}
      <button className="chat-input-attach" ...>...</button>

      {/* Oracle 下拉框 */}
      <div className="oracle-dropdown" ref={dropdownRef}>
        <button
          className={`oracle-trigger ${oracleMode !== 'quick' ? 'oracle-trigger--active' : ''}`}
          onClick={() => setDropdownOpen(!dropdownOpen)}
          title={currentOption.desc}
        >
          <span className="oracle-trigger-icon">{currentOption.icon}</span>
          <span className="oracle-trigger-label">{currentOption.label}</span>
          <svg className="oracle-chevron" ...>...</svg>
        </button>

        {dropdownOpen && (
          <div className="oracle-menu">
            {ORACLE_OPTIONS.map(opt => (
              <button
                key={opt.mode}
                className={`oracle-option ${opt.mode === oracleMode ? 'oracle-option--selected' : ''}`}
                onClick={() => { setOracleMode(opt.mode); setDropdownOpen(false) }}
              >
                <span className="oracle-option-icon">{opt.icon}</span>
                <div className="oracle-option-text">
                  <span className="oracle-option-label">{opt.label}</span>
                  <span className="oracle-option-desc">{opt.desc}</span>
                </div>
                {opt.mode === oracleMode && <span className="oracle-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 输入框 */}
      <textarea ... />
    </div>

    {/* 发送按钮 */}
    <button ...>...</button>
  </div>
)
```

### 3.4 样式

#### `src/renderer/src/styles/chat.css` — Oracle 下拉框样式

```css
/* Oracle 下拉框容器 */
.oracle-dropdown {
  position: relative;
  flex-shrink: 0;
}

/* 触发按钮 */
.oracle-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #666);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.oracle-trigger:hover {
  background: var(--bg-hover, #f5f5f5);
  border-color: var(--border-hover, #ccc);
}

/* 激活状态（非快速思考） */
.oracle-trigger--active {
  border-color: var(--oracle-color, #7c3aed);
  background: var(--oracle-bg, rgba(124, 58, 237, 0.08));
  color: var(--oracle-color, #7c3aed);
}

/* 下拉菜单 */
.oracle-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 100;
  animation: oracle-menu-in 0.15s ease-out;
}

@keyframes oracle-menu-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 菜单选项 */
.oracle-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.oracle-option:hover {
  background: var(--bg-hover, #f5f5f5);
}

.oracle-option--selected {
  background: var(--oracle-bg, rgba(124, 58, 237, 0.06));
}

.oracle-option-icon { font-size: 18px; }

.oracle-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.oracle-option-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a1a1a);
}

.oracle-option-desc {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.oracle-check {
  color: var(--oracle-color, #7c3aed);
  font-weight: 600;
}

/* Chevron 箭头 */
.oracle-chevron {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
}

.oracle-trigger[aria-expanded="true"] .oracle-chevron {
  transform: rotate(180deg);
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .oracle-menu {
    background: var(--bg-primary, #1e1e2e);
    border-color: var(--border-color, #333);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }
}
```

### 3.5 Service 层

#### `src/renderer/src/services/chatService.ts` — 传递 oracleMode

```typescript
// sendMessageStream 方法签名扩展
static async sendMessageStream(
  content: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  oracleMode?: OracleMode  // 新增参数
): Promise<void> {
  // ... 现有代码

  // IPC 调用时传入 oracleMode
  await window.electronAPI.invoke('ai:chatStream', {
    requestId,
    messages,
    oracleMode  // 新增
  })
}
```

### 3.6 主进程 — Oracle 推理服务（核心新增）

#### `src/main/core/oracle-reasoning-service.ts`

```typescript
import { spawn, type ChildProcess } from 'node:child_process'
import type { Logger } from '../types/logger'
import type { ConfigManager } from '../types/config'

/** Oracle 推理模式 */
export type OracleMode = 'quick' | 'deep' | 'full'

/** 模式配置 */
interface ModeConfig {
  baseUrl: string
  modelSuffix: string
  temperature: number
  timeoutMs: number
  systemPrompt: string
}

/** 模式配置映射 */
const MODE_CONFIGS: Record<OracleMode, ModeConfig> = {
  quick: {
    baseUrl: 'http://localhost:11434',
    modelSuffix: '',
    temperature: 0.7,
    timeoutMs: 120_000,
    systemPrompt: '' // 使用默认提示词
  },
  deep: {
    baseUrl: 'http://localhost:8080',
    modelSuffix: '+cot',
    temperature: 0.3,
    timeoutMs: 300_000,
    systemPrompt: ''
  },
  full: {
    baseUrl: 'http://localhost:8080',
    modelSuffix: '+tot',
    temperature: 0.2,
    timeoutMs: 600_000,
    systemPrompt: ''
  }
}

const ORACLE_PROXY_STARTUP_TIMEOUT = 15_000

/**
 * Oracle 推理服务
 * 管理 agent-reasoning 代理进程，提供多级推理能力
 */
export class OracleReasoningService {
  private proxyProcess: ChildProcess | null = null
  private proxyReady = false
  private logger: Logger
  private config: ConfigManager

  constructor(config: ConfigManager, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  /** 获取指定模式的配置 */
  getModeConfig(mode: OracleMode): ModeConfig {
    return MODE_CONFIGS[mode]
  }

  /** 检查代理是否可用 */
  async isProxyAvailable(): Promise<boolean> {
    try {
      const res = await fetch('http://localhost:8080/api/tags', {
        signal: AbortSignal.timeout(3000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  /** 启动代理服务器 */
  async startProxy(): Promise<boolean> {
    if (await this.isProxyAvailable()) {
      this.proxyReady = true
      this.logger.info('agent-reasoning 代理已在运行')
      return true
    }

    try {
      this.logger.info('正在启动 agent-reasoning 代理...')
      this.proxyProcess = spawn('agent-reasoning-server', ['--port', '8080'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      })

      this.proxyProcess.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString()
        if (msg.includes('Uvicorn running') || msg.includes('8080')) {
          this.proxyReady = true
          this.logger.info('agent-reasoning 代理启动成功')
        }
      })

      this.proxyProcess.stderr?.on('data', (data: Buffer) => {
        this.logger.warn('agent-reasoning 代理 stderr', { data: data.toString() })
      })

      this.proxyProcess.on('exit', (code) => {
        this.proxyReady = false
        this.proxyProcess = null
        this.logger.warn(`agent-reasoning 代理退出，code=${code}`)
      })

      // 等待代理就绪
      const deadline = Date.now() + ORACLE_PROXY_STARTUP_TIMEOUT
      while (Date.now() < deadline) {
        if (await this.isProxyAvailable()) {
          this.proxyReady = true
          return true
        }
        await new Promise(r => setTimeout(r, 500))
      }

      this.logger.error('agent-reasoning 代理启动超时')
      return false
    } catch (err) {
      this.logger.error('启动 agent-reasoning 代理失败', err as Error)
      return false
    }
  }

  /** 停止代理 */
  stopProxy(): void {
    if (this.proxyProcess) {
      this.proxyProcess.kill()
      this.proxyProcess = null
      this.proxyReady = false
      this.logger.info('agent-reasoning 代理已停止')
    }
  }

  /** 代理是否就绪 */
  isReady(): boolean {
    return this.proxyReady
  }
}
```

### 3.7 主进程 — ai-service.ts 改动

```typescript
// 在 OllamaAIService 中新增：

import type { OracleMode } from './oracle-reasoning-service'
import type { OracleReasoningService } from './oracle-reasoning-service'

// 新增属性
private oracleService?: OracleReasoningService

// 新增方法：设置 oracle 服务
setOracleService(oracle: OracleReasoningService): void {
  this.oracleService = oracle
}

// 修改 chatStream 方法，支持 oracleMode
async *chatStream(
  messages: ChatMessage[],
  options?: ChatOptions
): AsyncGenerator<ChatChunk> {
  await this.ensureConfigReady()

  const oracleMode = options?.oracleMode ?? 'quick'
  let baseUrl = this.baseUrl
  let model = options?.model ?? this.model
  let temperature = options?.temperature ?? 0.7
  let timeout = this.timeout

  // Oracle 模式覆盖
  if (oracleMode !== 'quick' && this.oracleService?.isReady()) {
    const modeConfig = this.oracleService.getModeConfig(oracleMode)
    baseUrl = modeConfig.baseUrl
    model = model + modeConfig.modelSuffix
    temperature = modeConfig.temperature
    timeout = modeConfig.timeoutMs
  }

  // ... 使用 baseUrl / model / temperature / timeout 发起请求
  // （其余流式逻辑不变，只是用新的变量替换原来的 this.xxx）
}
```

### 3.8 主进程 — ipc-handlers.ts 改动

```typescript
// 修改 ai:chatStream 处理器签名：

ipcMain.handle('ai:chatStream', async (event, args: {
  requestId: string
  messages: Array<{ role: string; content: string; images?: string[] }>
  oracleMode?: 'quick' | 'deep' | 'full'  // 新增
}) => {
  const { requestId, messages, oracleMode = 'quick' } = args
  // ...

  // 传递 oracleMode 给 aiService
  for await (const chunk of aiService.chatStream(chatMessages, {
    tools: tools.length > 0 ? tools : undefined,
    oracleMode  // 新增
  })) {
    // ... 现有逻辑不变
  }
})
```

### 3.9 主进程 — index.ts 启动集成

```typescript
// 在应用启动时初始化 Oracle 服务：

import { OracleReasoningService } from './core/oracle-reasoning-service'

// 创建实例
const oracleService = new OracleReasoningService(config, logger)

// 尝试启动代理（非阻塞，失败不影响正常使用）
oracleService.startProxy().then(ok => {
  if (ok) {
    logger.info('Oracle 深度推理已就绪')
  } else {
    logger.info('Oracle 代理未就绪，仅支持快速思考模式')
  }
})

// 注入到 AI 服务
aiService.setOracleService(oracleService)

// 应用退出时清理
app.on('before-quit', () => {
  oracleService.stopProxy()
})
```

---

## 四、降级策略

当 agent-reasoning 代理不可用时：

| 请求模式 | 实际行为 |
|---------|---------|
| `quick` | ✅ 正常工作（不依赖代理） |
| `deep` | ⚠️ 降级到 `quick` + 提示"代理未就绪，已切换到快速思考" |
| `full` | ⚠️ 降级到 `quick` + 同上提示 |

前端显示 Toast 提示用户代理不可用。

---

## 五、开发步骤

```
Step 1  类型定义 — ipc.ts + ai.ts 扩展 OracleMode
Step 2  Store — useChatStore 新增 oracleMode 状态
Step 3  UI — ChatInput 新增 Oracle 下拉框 + 样式
Step 4  Service — chatService 传递 oracleMode 参数
Step 5  主进程 — 新建 oracle-reasoning-service.ts
Step 6  主进程 — ai-service.ts 支持 oracleMode 切换
Step 7  主进程 — ipc-handlers.ts 传递 oracleMode
Step 8  主进程 — index.ts 启动集成
Step 9  降级处理 — 代理不可用时的提示和回退
Step 10 联调测试
```

---

## 六、依赖安装（用户侧）

```bash
# 安装 agent-reasoning
pip install agent-reasoning

# 或带服务器功能
pip install "agent-reasoning[server]"

# 拉取推荐模型
ollama pull qwen3.5:9b
```

---

## 七、后续扩展

- **自定义策略**：用户可在设置中配置默认策略
- **策略热切换**：对话中途切换推理强度
- **推理可视化**：展示 CoT/ToT 的推理过程
- **性能统计**：显示每次推理的耗时、token 用量
- **模型推荐**：根据问题类型自动推荐最佳模型+策略组合

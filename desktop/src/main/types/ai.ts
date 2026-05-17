/** AI 服务接口 */
export interface AIService {
  /** 发送对话请求 */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>

  /** 流式对话 */
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk>

  /** 分析图片 */
  analyzeImage(base64Image: string, prompt: string): Promise<string>

  /** 意图识别 */
  recognizeIntent(input: string, capabilities: string[]): Promise<IntentResult>

  /** 生成嵌入向量 */
  embed(text: string, model?: string): Promise<number[]>
}

/** 对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

/** 工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 对话选项 */
export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: ToolDefinition[]
  stream?: boolean
}

/** 工具定义 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** 对话响应 */
export interface ChatResponse {
  message: ChatMessage
  done: boolean
  totalDuration?: number
  evalCount?: number
}

/** 流式对话块 */
export interface ChatChunk {
  message: {
    content?: string
    tool_calls?: ToolCall[]
  }
  done: boolean
}

/** 意图识别结果 */
export interface IntentResult {
  intent: string
  confidence: number
  params: Record<string, unknown>
  moduleId?: string
}

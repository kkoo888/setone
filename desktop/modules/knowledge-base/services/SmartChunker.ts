import type { Logger } from '../../../src/main/types/logger'

/** 切片策略类型 */
type ChunkStrategy = 'auto' | 'records' | 'lines' | 'paragraphs' | 'fixed'

/** 内容类型检测结果 */
interface ContentInfo {
  type: 'json-array' | 'jsonl' | 'csv' | 'structured-text' | 'plain-text'
  strategy: ChunkStrategy
  recordCount?: number
}

/**
 * 智能文本切片器
 * 根据内容类型自动选择最佳切片策略：
 * - JSON 数组 → 按记录切片（每 N 条记录一片）
 * - JSONL → 按行分组切片
 * - CSV → 按行分组切片（保留表头）
 * - 结构化文本 → 按段落/节切片
 * - 普通文本 → 按字符数 + 句子边界切片
 */
export class Chunker {
  private readonly chunkSize: number
  private readonly overlap: number
  private readonly maxRecordsPerChunk: number
  private readonly logger?: Logger

  constructor(chunkSize: number = 512, overlap: number = 64, logger?: Logger) {
    this.chunkSize = chunkSize
    this.overlap = overlap
    this.maxRecordsPerChunk = 20 // 每片最多 N 条记录
    this.logger = logger
  }

  /**
   * 切分文本（自动检测内容类型）
   * @param text - 原始文本
   * @param hint - 格式提示（文件扩展名，如 '.csv', '.jsonl'）
   */
  chunk(text: string, hint?: string): string[] {
    if (!text || text.trim().length === 0) return []

    // 清理文本
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    // 检测内容类型
    const info = this.detectContentType(cleaned, hint)

    this.logger?.debug?.(`切片策略: ${info.strategy}, 内容类型: ${info.type}, 记录数: ${info.recordCount ?? 'N/A'}`)

    switch (info.strategy) {
      case 'records':
        return this.chunkByRecords(cleaned, info)
      case 'lines':
        return this.chunkByLines(cleaned)
      case 'paragraphs':
        return this.chunkByParagraphs(cleaned)
      case 'fixed':
      default:
        return this.chunkByFixed(cleaned)
    }
  }

  /**
   * 批量切片（多文件）
   */
  chunkBatch(texts: Array<{ text: string; hint?: string }>): string[][] {
    return texts.map(({ text, hint }) => this.chunk(text, hint))
  }

  // ═══════════════════════════════════════════
  //  内容类型检测
  // ═══════════════════════════════════════════

  private detectContentType(text: string, hint?: string): ContentInfo {
    // 根据文件扩展名提示
    if (hint === '.jsonl') {
      const lineCount = text.split('\n').filter(l => l.trim()).length
      return { type: 'jsonl', strategy: 'lines', recordCount: lineCount }
    }

    if (hint === '.csv') {
      const lineCount = text.split('\n').filter(l => l.trim()).length
      return { type: 'csv', strategy: 'lines', recordCount: lineCount }
    }

    if (hint === '.json') {
      // 检测是否是数组格式
      const trimmed = text.trim()
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // 估算记录数（按顶层元素分隔）
        const inner = trimmed.slice(1, -1).trim()
        if (inner.length > 0) {
          const recordCount = this.countJsonArrayItems(inner)
          return { type: 'json-array', strategy: 'records', recordCount }
        }
      }
      return { type: 'structured-text', strategy: 'paragraphs' }
    }

    if (hint === '.html' || hint === '.htm' || hint === '.xml' || hint === '.yaml' || hint === '.yml') {
      return { type: 'structured-text', strategy: 'paragraphs' }
    }

    // 自动检测：JSON 数组
    const trimmed = text.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim()
      if (inner.length > 0) {
        const recordCount = this.countJsonArrayItems(inner)
        if (recordCount > 1) {
          return { type: 'json-array', strategy: 'records', recordCount }
        }
      }
    }

    // 自动检测：JSONL（多行，每行都是 JSON）
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length > 3) {
      const jsonLineCount = lines.filter(l => {
        const t = l.trim()
        return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
      }).length
      if (jsonLineCount > lines.length * 0.7) {
        return { type: 'jsonl', strategy: 'lines', recordCount: lines.length }
      }

      // 自动检测：CSV（多行，每行逗号数一致）
      const commaCounts = lines.slice(0, 10).map(l => (l.match(/,/g) || []).length)
      const firstCount = commaCounts[0]
      if (firstCount > 0 && commaCounts.every(c => c === firstCount)) {
        return { type: 'csv', strategy: 'lines', recordCount: lines.length }
      }
    }

    // 自动检测：段落型文本（有明确的双换行分隔）
    const paragraphs = text.split(/\n\n+/)
    if (paragraphs.length > 3) {
      const avgLen = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length
      if (avgLen > 50 && avgLen < this.chunkSize * 2) {
        return { type: 'structured-text', strategy: 'paragraphs' }
      }
    }

    return { type: 'plain-text', strategy: 'fixed' }
  }

  /**
   * 估算 JSON 数组中的顶层元素数量
   */
  private countJsonArrayItems(inner: string): number {
    let count = 0
    let depth = 0
    let inString = false
    let escape = false

    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]

      if (escape) {
        escape = false
        continue
      }

      if (ch === '\\' && inString) {
        escape = true
        continue
      }

      if (ch === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === '{' || ch === '[') depth++
      if (ch === '}' || ch === ']') depth--

      if (ch === ',' && depth === 0) count++
    }

    return count + 1
  }

  // ═══════════════════════════════════════════
  //  切片策略实现
  // ═══════════════════════════════════════════

  /**
   * 策略1：按记录切片（适用于 JSON 数组）
   * 每 N 条记录组成一片，保持记录完整性
   */
  private chunkByRecords(text: string, info: ContentInfo): string[] {
    const trimmed = text.trim()
    if (!trimmed.startsWith('[')) return this.chunkByFixed(text)

    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []

    // 按顶层逗号分割记录
    const records = this.splitJsonArrayItems(inner)
    if (records.length === 0) return []

    const chunks: string[] = []
    let currentChunk: string[] = []
    let currentSize = 0

    for (const record of records) {
      const recordStr = record.trim()
      if (!recordStr) continue

      // 如果单条记录就超了，单独成片
      if (recordStr.length > this.chunkSize) {
        // 先保存当前批次
        if (currentChunk.length > 0) {
          chunks.push('[\n' + currentChunk.join(',\n') + '\n]')
          currentChunk = []
          currentSize = 0
        }
        // 大记录单独切片
        chunks.push('[\n' + recordStr + '\n]')
        continue
      }

      // 检查是否需要换片
      const newSize = currentSize + recordStr.length + (currentChunk.length > 0 ? 2 : 0)
      if (newSize > this.chunkSize && currentChunk.length > 0) {
        chunks.push('[\n' + currentChunk.join(',\n') + '\n]')
        currentChunk = []
        currentSize = 0
      }

      currentChunk.push(recordStr)
      currentSize += recordStr.length + 2
    }

    // 最后一批
    if (currentChunk.length > 0) {
      chunks.push('[\n' + currentChunk.join(',\n') + '\n]')
    }

    return chunks
  }

  /**
   * 按顶层逗号分割 JSON 数组元素（正确处理嵌套）
   */
  private splitJsonArrayItems(inner: string): string[] {
    const items: string[] = []
    let depth = 0
    let inString = false
    let escape = false
    let start = 0

    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]

      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue

      if (ch === '{' || ch === '[') depth++
      if (ch === '}' || ch === ']') depth--

      if (ch === ',' && depth === 0) {
        items.push(inner.substring(start, i))
        start = i + 1
      }
    }

    // 最后一个元素
    const last = inner.substring(start).trim()
    if (last) items.push(last)

    return items
  }

  /**
   * 策略2：按行分组切片（适用于 JSONL、CSV）
   * 每 N 行组成一片，CSV 保留表头
   */
  private chunkByLines(text: string): string[] {
    const lines = text.split('\n')
    if (lines.length === 0) return []

    // 检测是否有表头（CSV）
    const firstLine = lines[0]
    const hasHeader = firstLine.includes(',') && lines.length > 1
    const header = hasHeader ? firstLine : null
    const dataLines = hasHeader ? lines.slice(1) : lines

    const chunks: string[] = []
    let currentChunk: string[] = []
    let currentSize = 0

    for (const line of dataLines) {
      if (!line.trim()) continue

      const lineSize = line.length + 1
      const headerSize = header ? header.length + 1 : 0
      const totalNewSize = currentSize + lineSize + (currentChunk.length === 0 ? headerSize : 0)

      if (totalNewSize > this.chunkSize && currentChunk.length > 0) {
        // 输出当前片
        const content = header && currentChunk.length > 0
          ? header + '\n' + currentChunk.join('\n')
          : currentChunk.join('\n')
        chunks.push(content)
        currentChunk = []
        currentSize = 0
      }

      currentChunk.push(line)
      currentSize += lineSize
    }

    // 最后一批
    if (currentChunk.length > 0) {
      const content = header
        ? header + '\n' + currentChunk.join('\n')
        : currentChunk.join('\n')
      chunks.push(content)
    }

    return chunks
  }

  /**
   * 策略3：按段落切片（适用于 HTML、XML、YAML 等结构化文本）
   * 按双换行分割段落，合并到 chunkSize 以内
   */
  private chunkByParagraphs(text: string): string[] {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
    if (paragraphs.length === 0) return []

    const chunks: string[] = []
    let currentChunk: string[] = []
    let currentSize = 0

    for (const para of paragraphs) {
      const paraSize = para.length + (currentChunk.length > 0 ? 2 : 0)

      // 单段落超长，按固定策略切
      if (para.length > this.chunkSize) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join('\n\n'))
          currentChunk = []
          currentSize = 0
        }
        chunks.push(...this.chunkByFixed(para))
        continue
      }

      if (currentSize + paraSize > this.chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'))
        currentChunk = []
        currentSize = 0
      }

      currentChunk.push(para)
      currentSize += paraSize
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'))
    }

    return chunks
  }

  /**
   * 策略4：按固定字符数切片（通用兜底）
   * 在句子边界处断开
   */
  private chunkByFixed(text: string): string[] {
    if (text.length <= this.chunkSize) return [text]

    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      let end = start + this.chunkSize

      if (end < text.length) {
        // 在句子边界断开
        const searchStart = Math.max(start + this.chunkSize - 100, start)
        const segment = text.substring(searchStart, end)
        const breakPoints = [
          segment.lastIndexOf('\n\n'),
          segment.lastIndexOf('。'),
          segment.lastIndexOf('. '),
          segment.lastIndexOf('\n'),
          segment.lastIndexOf('，'),
          segment.lastIndexOf(', '),
        ]

        let bestBreak = -1
        for (const bp of breakPoints) {
          if (bp > bestBreak && bp > 10) {
            bestBreak = bp
          }
        }

        if (bestBreak > 0) {
          end = searchStart + bestBreak + 1
        }
      } else {
        end = text.length
      }

      const chunk = text.substring(start, end).trim()
      if (chunk.length > 0) {
        chunks.push(chunk)
      }

      // 下一段从 overlap 位置开始
      const nextStart = end - this.overlap
      if (nextStart <= start) {
        start = end // 防止死循环
      } else {
        start = nextStart
      }
    }

    return chunks
  }
}

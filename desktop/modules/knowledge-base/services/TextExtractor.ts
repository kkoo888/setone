import { readFile } from 'fs/promises'
import { extname } from 'path'
import type { Logger } from '../../../src/main/types/logger'

/**
 * 文本提取器
 * 从各种文件格式中提取纯文本内容
 * 支持：md, txt, json, csv, ts, js, py, jsonl, yaml/yml, html, xml, parquet
 */
export class TextExtractor {
  private readonly logger: Logger
  private yamlModule: any = null
  private xmlParser: any = null

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * 懒加载 js-yaml
   */
  private async getYaml(): Promise<any> {
    if (!this.yamlModule) {
      try {
        this.yamlModule = await import('js-yaml')
      } catch {
        this.logger.warn('js-yaml 未安装，YAML 格式将按纯文本处理')
        return null
      }
    }
    return this.yamlModule
  }

  /**
   * 懒加载 fast-xml-parser
   */
  private async getXmlParser(): Promise<any> {
    if (!this.xmlParser) {
      try {
        this.xmlParser = await import('fast-xml-parser')
      } catch {
        this.logger.warn('fast-xml-parser 未安装，XML 格式将按纯文本处理')
        return null
      }
    }
    return this.xmlParser
  }

  /**
   * 从文件中提取文本
   */
  async extract(filePath: string, ext: string): Promise<string> {
    ext = ext.toLowerCase()

    switch (ext) {
      // ── 直接读取的文本格式 ──
      case '.md':
      case '.txt':
      case '.ts':
      case '.js':
      case '.py':
        return await readFile(filePath, 'utf-8')

      // ── JSON ──
      case '.json':
        return await this.extractJson(filePath)

      // ── JSONL（每行一个 JSON）──
      case '.jsonl':
        return await this.extractJsonl(filePath)

      // ── CSV ──
      case '.csv':
        return await this.extractCsv(filePath)

      // ── YAML ──
      case '.yaml':
      case '.yml':
        return await this.extractYaml(filePath)

      // ── HTML ──
      case '.html':
      case '.htm':
        return await this.extractHtml(filePath)

      // ── XML ──
      case '.xml':
        return await this.extractXml(filePath)

      // ── Parquet ──
      case '.parquet':
        return await this.extractParquet(filePath)

      // ── PDF ──
      case '.pdf':
        return await this.extractPdf(filePath)

      // ── DOCX ──
      case '.docx':
        return await this.extractDocx(filePath)

      // ── 兜底：尝试当纯文本读取 ──
      default:
        this.logger.warn(`未知格式 ${ext}，尝试按纯文本读取: ${filePath}`)
        return await readFile(filePath, 'utf-8')
    }
  }

  // ═══════════════════════════════════════════
  //  各格式提取实现
  // ═══════════════════════════════════════════

  /**
   * JSON → 保留结构的可读文本
   * 将 JSON 对象转为 key: value 形式，便于向量化检索
   */
  private async extractJson(filePath: string): Promise<string> {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)

      // 如果是数组，每项一行
      if (Array.isArray(parsed)) {
        return parsed.map((item, i) => {
          if (typeof item === 'string') return item
          if (typeof item === 'object' && item !== null) {
            return this.flattenObject(item)
          }
          return String(item)
        }).join('\n\n')
      }

      // 如果是对象，转为 key: value 格式
      if (typeof parsed === 'object' && parsed !== null) {
        return this.flattenObject(parsed)
      }

      return String(parsed)
    } catch (err) {
      this.logger.warn(`JSON 解析失败，按纯文本读取: ${(err as Error).message}`)
      return await readFile(filePath, 'utf-8')
    }
  }

  /**
   * JSONL → 每行一个记录，保留为可读文本
   */
  private async extractJsonl(filePath: string): Promise<string> {
    const raw = await readFile(filePath, 'utf-8')
    const lines = raw.split('\n').filter(l => l.trim())

    const results: string[] = []
    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        if (typeof obj === 'object' && obj !== null) {
          results.push(this.flattenObject(obj))
        } else {
          results.push(String(obj))
        }
      } catch {
        // 非 JSON 行，保留原文
        results.push(line.trim())
      }
    }
    return results.join('\n\n')
  }

  /**
   * CSV → 保留表头 + 每行数据的可读文本
   */
  private async extractCsv(filePath: string): Promise<string> {
    const raw = await readFile(filePath, 'utf-8')
    const lines = raw.split('\n').filter(l => l.trim())

    if (lines.length === 0) return ''

    // 解析 CSV 行（支持引号包裹）
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseCsvLine(lines[0])
    const rows: string[] = []

    // 每行转为 "header1: value1, header2: value2" 格式
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i])
      const pairs: string[] = []
      for (let j = 0; j < headers.length && j < values.length; j++) {
        if (values[j]) {
          pairs.push(`${headers[j]}: ${values[j]}`)
        }
      }
      if (pairs.length > 0) {
        rows.push(pairs.join(', '))
      }
    }

    return rows.join('\n')
  }

  /**
   * YAML → 解析后转为可读文本
   */
  private async extractYaml(filePath: string): Promise<string> {
    const yaml = await this.getYaml()
    if (!yaml) {
      // fallback：按纯文本读取
      return await readFile(filePath, 'utf-8')
    }

    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = yaml.load(raw)

      if (typeof parsed === 'object' && parsed !== null) {
        return this.flattenObject(parsed)
      }
      return String(parsed)
    } catch (err) {
      this.logger.warn(`YAML 解析失败，按纯文本读取: ${(err as Error).message}`)
      return await readFile(filePath, 'utf-8')
    }
  }

  /**
   * HTML → 去标签后的纯文本
   */
  private async extractHtml(filePath: string): Promise<string> {
    const raw = await readFile(filePath, 'utf-8')
    return this.stripHtml(raw)
  }

  /**
   * XML → 解析后转为可读文本
   */
  private async extractXml(filePath: string): Promise<string> {
    const xmlParser = await this.getXmlParser()
    if (!xmlParser) {
      // fallback：去标签当纯文本
      const raw = await readFile(filePath, 'utf-8')
      return this.stripHtml(raw)
    }

    try {
      const raw = await readFile(filePath, 'utf-8')
      const parser = new xmlParser.XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        trimValues: true
      })
      const parsed = parser.parse(raw)

      if (typeof parsed === 'object' && parsed !== null) {
        return this.flattenObject(parsed)
      }
      return String(parsed)
    } catch (err) {
      this.logger.warn(`XML 解析失败，去标签处理: ${(err as Error).message}`)
      const raw = await readFile(filePath, 'utf-8')
      return this.stripHtml(raw)
    }
  }

  /**
   * Parquet → 逐行转为可读文本
   * 使用 @dsnp/parquetjs（活跃维护的纯 JS Parquet 读取库）
   */
  private async extractParquet(filePath: string): Promise<string> {
    try {
      const parquet = await import('@dsnp/parquetjs')
      const reader = await parquet.ParquetReader.openFile(filePath)

      // schema 是属性不是方法，通过 fields 获取列名
      const schema = reader.schema
      const fields = Object.keys(schema.fields)
      const rows: string[] = []

      // 使用 for await 迭代（@dsnp/parquetjs 支持 Symbol.asyncIterator）
      let count = 0
      const maxRows = 10000 // 防止超大文件

      for await (const record of reader) {
        if (count >= maxRows) break

        const pairs: string[] = []
        for (const field of fields) {
          const value = (record as any)[field]
          if (value !== null && value !== undefined) {
            // 处理嵌套对象
            if (typeof value === 'object' && !Array.isArray(value)) {
              pairs.push(`${field}: ${JSON.stringify(value)}`)
            } else if (Array.isArray(value)) {
              pairs.push(`${field}: ${value.join(', ')}`)
            } else {
              pairs.push(`${field}: ${String(value)}`)
            }
          }
        }
        if (pairs.length > 0) {
          rows.push(pairs.join(', '))
        }
        count++
      }

      await reader.close()

      if (count >= maxRows) {
        this.logger.warn(`Parquet 文件超过 ${maxRows} 行，已截断: ${filePath}`)
      }

      return rows.join('\n')
    } catch (err) {
      this.logger.error(`Parquet 读取失败: ${(err as Error).message}`)
      return ''
    }
  }

  // ═══════════════════════════════════════════
  //  PDF / DOCX 提取
  // ═══════════════════════════════════════════

  /**
   * PDF → 纯文本（pdf-parse）
   */
  private async extractPdf(filePath: string): Promise<string> {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const buffer = await readFile(filePath)
      const data = await pdfParse(buffer)
      return data.text.trim()
    } catch (err) {
      this.logger.error(`PDF 解析失败: ${(err as Error).message}`)
      return ''
    }
  }

  /**
   * DOCX → 纯文本（mammoth）
   */
  private async extractDocx(filePath: string): Promise<string> {
    try {
      const mammoth = await import('mammoth')
      const buffer = await readFile(filePath)
      const result = await mammoth.extractRawText({ buffer })
      return result.value.trim()
    } catch (err) {
      this.logger.error(`DOCX 解析失败: ${(err as Error).message}`)
      return ''
    }
  }

  // ═══════════════════════════════════════════
  //  工具方法
  // ═══════════════════════════════════════════

  /**
   * 将对象扁平化为可读的 key: value 文本
   * 递归处理嵌套对象和数组
   */
  flattenObject(obj: any, prefix = '', depth = 0): string {
    if (depth > 5) return String(obj) // 防止无限递归
    if (obj === null || obj === undefined) return ''

    const lines: string[] = []

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (value === null || value === undefined) continue

      if (Array.isArray(value)) {
        if (value.length === 0) continue
        // 简单数组直接展示
        if (value.every(v => typeof v !== 'object')) {
          lines.push(`${fullKey}: ${value.join(', ')}`)
        } else {
          // 复杂数组，每项一行
          value.forEach((item, i) => {
            if (typeof item === 'object' && item !== null) {
              lines.push(this.flattenObject(item, `${fullKey}[${i}]`, depth + 1))
            } else {
              lines.push(`${fullKey}[${i}]: ${String(item)}`)
            }
          })
        }
      } else if (typeof value === 'object') {
        lines.push(this.flattenObject(value, fullKey, depth + 1))
      } else {
        lines.push(`${fullKey}: ${String(value)}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * HTML 去标签 → 纯文本
   */
  private stripHtml(html: string): string {
    return html
      // 块级标签转换行
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|h[1-6]|tr|blockquote|section|article)[^>]*>/gi, '\n')
      // 移除所有标签
      .replace(/<[^>]+>/g, '')
      // 解码常见 HTML 实体
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // 合并多余空白
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map(l => l.trim())
      .join('\n')
      .trim()
  }

  /**
   * 获取所有支持的格式列表
   */
  static getSupportedFormats(): string[] {
    return [
      '.md', '.txt', '.json', '.csv',
      '.ts', '.js', '.py',
      '.jsonl', '.yaml', '.yml',
      '.html', '.htm', '.xml',
      '.parquet', '.pdf', '.docx'
    ]
  }
}

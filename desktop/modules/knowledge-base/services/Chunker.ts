/**
 * 文本切片服务
 * 将长文本按固定大小切分为重叠片段
 */
export class Chunker {
  private readonly chunkSize: number
  private readonly overlap: number

  constructor(chunkSize: number = 512, overlap: number = 64) {
    this.chunkSize = chunkSize
    this.overlap = overlap
  }

  /**
   * 将文本切分为多个片段
   * @param text - 原始文本
   * @returns 切片后的文本数组
   */
  chunk(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return []
    }

    // 清理文本：合并多余空白
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

    if (cleaned.length <= this.chunkSize) {
      return [cleaned]
    }

    const chunks: string[] = []
    let start = 0

    while (start < cleaned.length) {
      let end = start + this.chunkSize

      // 如果不是最后一段，尝试在句子边界切分
      if (end < cleaned.length) {
        const searchStart = Math.max(start + this.chunkSize - 100, start)
        const segment = cleaned.substring(searchStart, end)
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
        end = cleaned.length
      }

      const chunk = cleaned.substring(start, end).trim()
      if (chunk.length > 0) {
        chunks.push(chunk)
      }

      // 下一段从 overlap 位置开始，确保前进
      const nextStart = end - this.overlap
      if (nextStart <= start) {
        // 防止死循环：强制前进
        start = end
      } else {
        start = nextStart
      }
    }

    return chunks
  }
}

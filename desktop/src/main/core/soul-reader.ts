import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

/**
 * 从 SOUL.md 中提取助手名称
 * 解析格式：代号 **小茜** 🌸
 */
export function readAssistantNameFromSoul(): string | null {
  try {
    // 从应用目录向上查找 SOUL.md（开发模式和打包模式兼容）
    const candidates = [
      join(__dirname, '../../SOUL.md'),       // 开发模式：desktop/../SOUL.md
      join(__dirname, '../../../SOUL.md'),     // 备选
      join(process.cwd(), 'SOUL.md'),          // 工作目录
    ]

    for (const soulPath of candidates) {
      if (existsSync(soulPath)) {
        const content = readFileSync(soulPath, 'utf-8')
        // 匹配：代号 **名称** 或 名字：**名称**
        const match = content.match(/代号\s*\*{0,2}([^*🌸\s]+)\*{0,2}/)
          ?? content.match(/名字[：:]\s*\*{0,2}([^*🌸\s]+)\*{0,2}/)
        if (match?.[1]) {
          return match[1].trim()
        }
      }
    }
  } catch (err) {
    console.error('[SoulReader] 读取 SOUL.md 失败:', err)
  }
  return null
}

// Cron 表达式解析器
// 支持通配符(*)、步长(STEP)、特定值 的分/时/日/月/周 字段
// 格式: 分 时 日 月 周
// 示例: "0 18 * * *"       = 每天 18:00
//       "0/5 * * * *"      = 每 5 分钟
//       "0 9 * * 1,2,3,4,5" = 工作日 9:00

import type { CronParsed } from '../types'

// 解析单个 cron 字段为合法数值数组
// field: 字段值（如 "*", "0/5", "0", "0,15,30"）
// min: 最小值
// max: 最大值
function parseField(field: string, min: number, max: number): number[] {
  // 通配符
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }

  // 步长: 如 "0/5" 表示从0开始每5个单位
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10)
    if (step <= 0 || step > max) {
      return []
    }
    const result: number[] = []
    for (let i = min; i <= max; i += step) {
      result.push(i)
    }
    return result
  }

  // 范围: n-m
  if (field.includes('-')) {
    const [startStr, endStr] = field.split('-')
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    if (isNaN(start) || isNaN(end) || start < min || end > max) {
      return []
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }

  // 列表: n,m,...
  if (field.includes(',')) {
    return field.split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => !isNaN(n) && n >= min && n <= max)
  }

  // 单个值
  const val = parseInt(field, 10)
  if (isNaN(val) || val < min || val > max) {
    return []
  }
  return [val]
}

/**
 * 解析 cron 表达式
 * @param expression cron 表达式（5 个字段）
 * @returns 解析后的各字段值数组
 */
export function parseCron(expression: string): CronParsed | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    return null
  }

  try {
    const minute = parseField(parts[0], 0, 59)
    const hour = parseField(parts[1], 0, 23)
    const dayOfMonth = parseField(parts[2], 1, 31)
    const month = parseField(parts[3], 1, 12)
    const dayOfWeek = parseField(parts[4], 0, 6)

    if (minute.length === 0 || hour.length === 0 || dayOfMonth.length === 0 ||
        month.length === 0 || dayOfWeek.length === 0) {
      return null
    }

    return { minute, hour, dayOfMonth, month, dayOfWeek }
  } catch {
    return null
  }
}

/**
 * 检查当前时间是否匹配 cron 表达式
 * @param parsed 解析后的 cron
 * @param date 要检查的时间
 */
export function matchCron(parsed: CronParsed, date: Date): boolean {
  const minute = date.getMinutes()
  const hour = date.getHours()
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1
  const dayOfWeek = date.getDay()

  return (
    parsed.minute.includes(minute) &&
    parsed.hour.includes(hour) &&
    parsed.dayOfMonth.includes(dayOfMonth) &&
    parsed.month.includes(month) &&
    parsed.dayOfWeek.includes(dayOfWeek)
  )
}

/**
 * 计算下一次匹配时间（分钟精度）
 * @param parsed 解析后的 cron
 * @param from 起始时间
 * @param maxMinutes 最大搜索分钟数（默认 7 天）
 */
export function nextCronTime(parsed: CronParsed, from: Date, maxMinutes = 10080): Date | null {
  const cursor = new Date(from)
  // 至少从下一分钟开始
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let i = 0; i < maxMinutes; i++) {
    if (matchCron(parsed, cursor)) {
      return new Date(cursor)
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return null
}

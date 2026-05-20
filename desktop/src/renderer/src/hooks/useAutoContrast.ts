/**
 * 自动对比度 Hook
 * 借鉴 Mantine autoContrast + luminanceThreshold
 * 
 * 根据背景色自动计算合适的前景文字颜色
 * 用于组件在用户自定义主题时保持可读性
 */
import { useMemo } from 'react'

/** 获取相对亮度 (WCAG 2.0) */
function getRelativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const [rs, gs, bs] = [r, g, b].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  )
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** 根据背景色自动返回合适的前景色 */
export function autoContrast(bgHex: string, threshold = 0.3): string {
  const lum = getRelativeLuminance(bgHex)
  return lum > threshold ? '#1a1a1a' : '#ffffff'
}

/**
 * Hook：根据当前 CSS 变量自动计算对比色
 * @param bgVar - CSS 变量名，如 '--primary'
 * @param threshold - 亮度阈值，默认 0.3
 */
export function useAutoContrast(bgVar: string, threshold = 0.3): string {
  return useMemo(() => {
    try {
      const val = getComputedStyle(document.documentElement).getPropertyValue(bgVar).trim()
      if (!val || !val.startsWith('#')) return '#ffffff'
      return autoContrast(val, threshold)
    } catch {
      return '#ffffff'
    }
  }, [bgVar, threshold])
}

/**
 * Hook：批量计算多组 bg/fg 对
 * @param pairs - 如 { primary: '--primary', card: '--card' }
 */
export function useAutoContrastBatch(
  pairs: Record<string, string>,
  threshold = 0.3
): Record<string, string> {
  return useMemo(() => {
    const result: Record<string, string> = {}
    for (const [key, varName] of Object.entries(pairs)) {
      try {
        const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
        result[key] = val && val.startsWith('#') ? autoContrast(val, threshold) : '#ffffff'
      } catch {
        result[key] = '#ffffff'
      }
    }
    return result
  }, [JSON.stringify(pairs), threshold])
}

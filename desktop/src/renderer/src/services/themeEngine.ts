/**
 * SetOne 主题引擎 v2.0
 * 
 * 核心能力：
 * 1. Seed Token → Map Token 自动派生（色阶、圆角、间距）
 * 2. Map Token → Alias Token 语义化映射
 * 3. 暗色模式自动生成
 * 4. autoContrast 自动对比度
 * 5. 组件级 Token 支持
 * 
 * 借鉴：Ant Design 三层架构 + Chakra 色阶 + Mantine autoContrast + shadcn/ui bg/fg 配对
 */

// ─── 类型定义 ────────────────────────────────────────

/** Seed Token：用户只需定义这 7 个值 */
export interface SeedToken {
  accent: string       // 主色 hex
  bg: string           // 背景色 hex
  fg: string           // 前景色 hex
  radius: number       // 圆角基数 (px)
  fontBase: number     // 字号基数 (px)
  spacingBase: number  // 间距基数 (px)
  mode: 'light' | 'dark'
}

/** 色阶：50-900 十级 */
export interface ColorScale {
  50: string; 100: string; 200: string; 300: string; 400: string
  500: string; 600: string; 700: string; 800: string; 900: string
}

/** 圆角梯度 */
export interface RadiusScale {
  xs: string; sm: string; md: string; lg: string
  xl: string; '2xl': string; '3xl': string; full: string
}

/** 间距梯度 */
export interface SpacingScale {
  '2xs': string; xs: string; sm: string; md: string
  lg: string; xl: string; '2xl': string
}

/** 字号梯度 */
export interface FontSizeScale {
  '2xs': string; xs: string; sm: string; md: string
  lg: string; xl: string; '2xl': string; '3xl': string
}

/** 完整的 CSS 变量集合 */
export type ThemeVariables = Record<string, string>

/** 主题 JSON v2 格式 */
export interface ThemeConfigV2 {
  id: string
  name: string
  author: string
  description: string
  seed: {
    accent: string
    bg: string
    fg: string
    radius?: number
    fontBase?: number
    spacingBase?: number
    mode: 'light' | 'dark'
  }
  overrides?: {
    alias?: Record<string, string>
    component?: Record<string, Record<string, string>>
  }
}

/** 旧版主题 JSON 格式（兼容） */
export interface ThemeConfigV1 {
  id: string
  name: string
  author: string
  description: string
  mode: 'light' | 'dark'
  colors: Record<string, string>
}

// ─── 常量定义（P3C：禁止魔法数字）───────────────────

/** 色阶派生：每级的调亮/调暗比例 */
const COLOR_SCALE_LIGHTEN = [0.90, 0.80, 0.65, 0.45, 0.25] as const  // 50-400
const COLOR_SCALE_DARKEN  = [0.10, 0.20, 0.35, 0.50] as const         // 600-900

/** 圆角派生：各级相对于基数的倍率 */
const RADIUS_MULTIPLIERS = {
  xs: 0.4, sm: 0.6, md: 0.8, lg: 1.0,
  xl: 1.4, '2xl': 1.8, '3xl': 2.2,
} as const

/** 间距派生：各级相对于基数的倍率 */
const SPACING_MULTIPLIERS = {
  '2xs': 0.25, xs: 0.5, sm: 1.0, md: 2.0,
  lg: 3.0, xl: 4.0, '2xl': 6.0,
} as const

/** 字号梯度：固定整数像素值，比原始值小2px（借鉴 shadcn/ui + Ant Design） */
const FONT_SIZE_SCALE: Record<string, number> = {
  '2xs': 8,    // 极小：辅助标签、徽章
  xs: 10,      // 次小：时间戳、说明文字
  sm: 12,      // 正文小号
  md: 14,      // 正文（桌面应用默认）
  lg: 16,      // 中等：输入框、按钮、小标题
  xl: 18,      // 大号：页面标题
  '2xl': 22,   // 超大：模块标题
  '3xl': 30,   // 巨大：数字展示
}

/** Alpha 透明度色板：10 级 */
const ALPHA_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
const ALPHA_VALUES = [0.04, 0.06, 0.08, 0.16, 0.24, 0.36, 0.48, 0.64, 0.80, 0.92] as const

/** autoContrast 亮度阈值 */
const LUMINANCE_THRESHOLD = 0.3

/** 极暗色亮度阈值（低于此值不再 darken） */
const VERY_DARK_THRESHOLD = 0.05

/** 暗色模式 card/popover 相对于 bg 的提亮比例 */
const DARK_CARD_LIGHTEN = 0.05
const DARK_POPOVER_LIGHTEN = 0.08
const DARK_SIDEBAR_DARKEN = 0.03

/** 灰度色阶（亮色模式，借鉴 Radix 12 级） */
const GRAY_SCALE_LIGHT: Record<number, string> = {
  1: '#fcfcfc', 2: '#f9f9f9', 3: '#f0f0f0', 4: '#e8e8e8',
  5: '#d0d0d0', 6: '#b0b0b0', 7: '#8a8a8a', 8: '#6a6a6a',
  9: '#4a4a4a', 10: '#2a2a2a', 11: '#1a1a1a', 12: '#0a0a0a',
}

/** 灰度色阶（暗色模式，反转） */
const GRAY_SCALE_DARK: Record<number, string> = {
  1: '#0a0a0a', 2: '#111111', 3: '#1a1a1a', 4: '#222222',
  5: '#2a2a2a', 6: '#3a3a3a', 7: '#555555', 8: '#777777',
  9: '#999999', 10: '#b0b0b0', 11: '#d0d0d0', 12: '#e8e8e8',
}

/** 状态色（亮色/暗色） */
const STATUS_COLORS = {
  success: { light: '#22c55e', dark: '#34d399' },
  warning: { light: '#f59e0b', dark: '#fbbf24' },
  error:   { light: '#ef4444', dark: '#f87171' },
  info:    { light: '#3b82f6', dark: '#60a5fa' },
} as const

/** 图表色板 */
const CHART_COLORS = {
  light: ['#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'],
  dark:  ['#34d399', '#fbbf24', '#f87171', '#a78bfa'],
} as const

/** 默认字体栈 */
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
const FONT_MONO = "'Fira Code', 'Consolas', monospace"

// ─── 颜色工具函数 ────────────────────────────────────

/** hex → RGB */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** RGB → hex */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
}

/** 获取相对亮度 (WCAG 2.0) */
function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** 调亮颜色 */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
}

/** 调暗颜色 */
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

// ─── 自动对比度 ──────────────────────────────────────

/**
 * 根据背景色自动计算合适的前景文字颜色
 * 借鉴 Mantine autoContrast
 */
export function autoContrastColor(bgHex: string): string {
  const luminance = getRelativeLuminance(bgHex)
  return luminance > LUMINANCE_THRESHOLD ? '#1a1a1a' : '#ffffff'
}

/**
 * 检查两个颜色之间的对比度是否满足 WCAG AA 标准
 */
export function meetsContrastRatio(fg: string, bg: string, ratio = 4.5): boolean {
  const l1 = getRelativeLuminance(fg)
  const l2 = getRelativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darkerVal = Math.min(l1, l2)
  return (lighter + 0.05) / (darkerVal + 0.05) >= ratio
}

// ─── 派生函数 ────────────────────────────────────────

/**
 * 从基准色派生 50-900 色阶（借鉴 Chakra UI）
 * 50 = 最浅（背景用），500 = 基准，900 = 最深
 */
export function deriveColorScale(baseColor: string): ColorScale {
  const lightenSteps = COLOR_SCALE_LIGHTEN.map(amt => lighten(baseColor, amt))
  const darkenSteps = COLOR_SCALE_DARKEN.map(amt => darken(baseColor, amt))
  return {
    50: lightenSteps[0], 100: lightenSteps[1], 200: lightenSteps[2],
    300: lightenSteps[3], 400: lightenSteps[4],
    500: baseColor,
    600: darkenSteps[0], 700: darkenSteps[1], 800: darkenSteps[2], 900: darkenSteps[3],
  }
}

/** 灰度色阶 */
export function deriveGrayScale(): Record<number, string> { return GRAY_SCALE_LIGHT }
export function deriveDarkGrayScale(): Record<number, string> { return GRAY_SCALE_DARK }

/**
 * 从基数派生圆角梯度（借鉴 shadcn/ui）
 * 改一个 --radius 值，全局圆角自动缩放
 */
export function deriveRadius(base: number): RadiusScale {
  return {
    xs:    `${base * RADIUS_MULTIPLIERS.xs}px`,
    sm:    `${base * RADIUS_MULTIPLIERS.sm}px`,
    md:    `${base * RADIUS_MULTIPLIERS.md}px`,
    lg:    `${base * RADIUS_MULTIPLIERS.lg}px`,
    xl:    `${base * RADIUS_MULTIPLIERS.xl}px`,
    '2xl': `${base * RADIUS_MULTIPLIERS['2xl']}px`,
    '3xl': `${base * RADIUS_MULTIPLIERS['3xl']}px`,
    full:  '9999px',
  }
}

/** 间距梯度 */
export function deriveSpacing(base: number): SpacingScale {
  return Object.fromEntries(
    Object.entries(SPACING_MULTIPLIERS).map(([k, m]) => [k, `${base * m}px`])
  ) as SpacingScale
}

/** 字号梯度（固定整数值，不依赖基数） */
export function deriveFontSize(): FontSizeScale {
  return Object.fromEntries(
    Object.entries(FONT_SIZE_SCALE).map(([k, v]) => [k, `${v}px`])
  ) as FontSizeScale
}

/** Alpha 透明度色板（借鉴 Chakra UI） */
export function deriveAlphaScale(): Record<string, string> {
  const vars: Record<string, string> = {}
  ALPHA_STEPS.forEach((step, i) => {
    const a = ALPHA_VALUES[i]
    vars[`--alpha-black-${step}`] = `rgba(0, 0, 0, ${a})`
    vars[`--alpha-white-${step}`] = `rgba(255, 255, 255, ${a})`
  })
  return vars
}

// ─── 主题派生引擎（拆分为子函数，P3C ≤80 行）──────

/** 生成色阶变量（--accent-50 ~ --accent-900, --gray-1 ~ --gray-12） */
function buildColorScaleVars(accent: ColorScale, gray: Record<number, string>): ThemeVariables {
  const vars: ThemeVariables = {}
  for (const [key, val] of Object.entries(accent)) {
    vars[`--accent-${key}`] = val
  }
  for (const [key, val] of Object.entries(gray)) {
    vars[`--gray-${key}`] = val
  }
  return vars
}

/** 生成设计基础变量（圆角、间距、字号、字体、Alpha） */
function buildDesignBaseVars(seed: SeedToken): ThemeVariables {
  const vars: ThemeVariables = {}
  const radius = deriveRadius(seed.radius)
  const spacing = deriveSpacing(seed.spacingBase)
  const fontSize = deriveFontSize()

  for (const [key, val] of Object.entries(radius)) vars[`--radius-${key}`] = val
  for (const [key, val] of Object.entries(spacing)) vars[`--spacing-${key}`] = val
  for (const [key, val] of Object.entries(fontSize)) vars[`--font-size-${key}`] = val
  Object.assign(vars, deriveAlphaScale())

  vars['--radius'] = `${seed.radius}px`
  vars['--font-family'] = FONT_FAMILY
  vars['--font-mono'] = FONT_MONO
  return vars
}

/** 生成 Alias Token（bg/fg 配对 + 状态色 + 侧边栏 + 图表） */
function buildAliasVars(seed: SeedToken, accent: ColorScale, gray: Record<number, string>): ThemeVariables {
  const vars: ThemeVariables = {}
  const isDark = seed.mode === 'dark'

  if (isDark) {
    const bgLum = getRelativeLuminance(seed.bg)
    vars['--bg'] = bgLum < VERY_DARK_THRESHOLD ? seed.bg : darken(seed.bg, DARK_CARD_LIGHTEN)
    vars['--fg'] = seed.fg || '#e8e8e8'
    vars['--card'] = lighten(vars['--bg'], DARK_CARD_LIGHTEN)
    vars['--card-fg'] = vars['--fg']
    vars['--popover'] = lighten(vars['--bg'], DARK_POPOVER_LIGHTEN)
    vars['--popover-fg'] = vars['--fg']
    vars['--primary'] = accent[400]
    vars['--primary-fg'] = '#ffffff'
    vars['--secondary'] = accent[900]
    vars['--secondary-fg'] = accent[200]
    vars['--muted'] = gray[3]
    vars['--muted-fg'] = gray[9]
    vars['--accent-bg'] = accent[900]
    vars['--accent-fg'] = accent[200]
    vars['--sidebar-bg'] = bgLum < VERY_DARK_THRESHOLD ? seed.bg : darken(vars['--bg'], DARK_SIDEBAR_DARKEN)
    vars['--sidebar-accent'] = accent[900]
    vars['--sidebar-accent-fg'] = accent[200]
  } else {
    vars['--bg'] = seed.bg || '#ffffff'
    vars['--fg'] = seed.fg || '#1a1a1a'
    vars['--card'] = '#ffffff'
    vars['--card-fg'] = vars['--fg']
    vars['--popover'] = '#ffffff'
    vars['--popover-fg'] = vars['--fg']
    vars['--primary'] = accent[600]
    vars['--primary-fg'] = '#ffffff'
    vars['--secondary'] = accent[100]
    vars['--secondary-fg'] = accent[700]
    vars['--muted'] = gray[2]
    vars['--muted-fg'] = gray[8]
    vars['--accent-bg'] = accent[100]
    vars['--accent-fg'] = accent[700]
    vars['--sidebar-bg'] = gray[1]
    vars['--sidebar-accent'] = accent[100]
    vars['--sidebar-accent-fg'] = accent[700]
  }

  // 亮暗通用
  vars['--destructive'] = '#ef4444'
  vars['--destructive-fg'] = '#ffffff'
  vars['--border'] = gray[4]
  vars['--input'] = gray[4]
  vars['--ring'] = isDark ? accent[400] : accent[600]
  vars['--overlay'] = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)'
  vars['--sidebar-fg'] = vars['--fg']
  vars['--sidebar-primary'] = vars['--primary']
  vars['--sidebar-primary-fg'] = '#ffffff'
  vars['--sidebar-border'] = gray[4]
  vars['--sidebar-ring'] = vars['--ring']

  return vars
}

/** 生成状态色 + 图表色板 + 阴影 + 过渡 */
function buildMiscVars(isDark: boolean, accent: ColorScale): ThemeVariables {
  const vars: ThemeVariables = {}

  // 状态色
  for (const [name, colors] of Object.entries(STATUS_COLORS)) {
    vars[`--${name}`] = isDark ? colors.dark : colors.light
    vars[`--${name}-fg`] = (name === 'warning' && isDark) ? '#0a0a0f' : '#ffffff'
  }

  // 图表色板
  vars['--chart-1'] = accent[500]
  const chartPalette = isDark ? CHART_COLORS.dark : CHART_COLORS.light
  chartPalette.forEach((color, i) => { vars[`--chart-${i + 2}`] = color })

  // 阴影
  const shadowAlpha = isDark ? 0.3 : 0.05
  vars['--shadow-sm'] = `0 1px 2px rgba(0, 0, 0, ${shadowAlpha})`
  vars['--shadow-md'] = `0 4px 6px rgba(0, 0, 0, ${shadowAlpha})`
  vars['--shadow-lg'] = `0 10px 15px rgba(0, 0, 0, ${shadowAlpha})`
  vars['--shadow-xl'] = `0 20px 25px rgba(0, 0, 0, ${isDark ? 0.4 : 0.1})`

  // 过渡
  vars['--transition-fast'] = '150ms ease'
  vars['--transition-normal'] = '250ms ease'
  vars['--transition-slow'] = '350ms ease'

  return vars
}

/**
 * 核心函数：从 Seed Token 派生出完整的 CSS 变量集合
 * 拆分为 4 个子函数，每个 ≤80 行（P3C 规范）
 */
export function deriveThemeVariables(seed: SeedToken): ThemeVariables {
  const isDark = seed.mode === 'dark'
  const accent = deriveColorScale(seed.accent)
  const gray = isDark ? GRAY_SCALE_DARK : GRAY_SCALE_LIGHT

  return {
    ...buildColorScaleVars(accent, gray),
    ...buildDesignBaseVars(seed),
    ...buildAliasVars(seed, accent, gray),
    ...buildMiscVars(isDark, accent),
  }
}

/**
 * 将 v1 格式主题转换为 v2 Seed Token
 */
export function migrateV1ToSeed(v1: ThemeConfigV1): SeedToken {
  const colors = v1.colors
  return {
    accent: colors.accent || '#4338ca',
    bg: colors['bg-primary'] || (v1.mode === 'dark' ? '#0a0a0f' : '#ffffff'),
    fg: colors['text-primary'] || (v1.mode === 'dark' ? '#e8e8e8' : '#1a1a1a'),
    radius: 8,
    fontBase: 14,
    spacingBase: 8,
    mode: v1.mode as 'light' | 'dark',
  }
}

/**
 * 应用主题到 DOM
 */
export function applyThemeToDOM(vars: ThemeVariables): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

/**
 * 移除所有主题变量（新 + 旧），用于切换时清理
 */
export function clearThemeVariables(): void {
  const root = document.documentElement
  const toRemove: string[] = []

  // 新变量前缀
  const newPrefixes = ['--accent-', '--gray-', '--radius-', '--spacing-', '--font-size-',
    '--alpha-', '--shadow-', '--chart-', '--sidebar-']
  // 新变量精确匹配
  const newExactVars = [
    '--bg', '--fg', '--card', '--card-fg', '--popover', '--popover-fg',
    '--primary', '--primary-fg', '--secondary', '--secondary-fg',
    '--muted', '--muted-fg', '--accent-bg', '--accent-fg',
    '--destructive', '--destructive-fg', '--border', '--input', '--ring',
    '--overlay', '--success', '--success-fg', '--warning', '--warning-fg',
    '--error', '--error-fg', '--info', '--info-fg',
    '--radius', '--font-family', '--font-mono',
    '--transition-fast', '--transition-normal', '--transition-slow',
  ]
  // 旧变量精确匹配（原 MainLayout 系统）
  const oldExactVars = [
    '--color-accent', '--color-accent-hover', '--color-accent-light',
    '--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary',
    '--color-text-primary', '--color-text-secondary', '--color-text-tertiary',
    '--color-border', '--color-shadow',
    '--color-success', '--color-warning', '--color-error', '--color-info',
    '--color-accent-text', '--color-accent-text-hover',
  ]

  for (let i = 0; i < root.style.length; i++) {
    const prop = root.style[i]
    if (newPrefixes.some(p => prop.startsWith(p)) ||
        newExactVars.includes(prop) ||
        oldExactVars.includes(prop)) {
      toRemove.push(prop)
    }
  }
  toRemove.forEach(p => root.style.removeProperty(p))
}

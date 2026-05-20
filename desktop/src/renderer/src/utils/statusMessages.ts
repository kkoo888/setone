/**
 * 统一状态消息 & 图标管理
 * 所有页面的图标、状态提示、空状态、操作结果消息统一在此定义
 * 其他文件禁止直接从 @icon-park/react 引入状态/空状态/操作类图标
 */
import React from 'react'
import {
  Message,
  Lightning,
  Refresh,
  Read,
  Globe,
  Keyboard,
  Clipboard,
  Notice,
  MessageOne,
  Calendar,
  PreviewOpen,
  ChartLine,
  Theme,
  Scissor,
  AllApplication,
  SettingOne,
  Cat,
  Drama,
  BookOpen,
  Brain,
  ListOne,
  Eyes,
  Monitor,
  Heart,
  Search,
  LinkFour,
  PlayOne,
  PauseOne,
  Time,
  Inbox,
  Star,
  Document,
  FolderOpen,
  LoadingFour,
  CheckOne,
  CloseOne,
  Help,
  Tips,
  Warning,
  Plug,
  ChartHistogram,
  Data,
  Pic,
  Computer,
  Sun,
  Moon,
  Square,
  FullScreenPlay,
  Robot,
  Magic,
  DeleteOne,
  DownloadOne,
  EditOne,
  Fire,
  Recycle,
  Pushpin,
  Location,
  Database,
} from '@icon-park/react'

// ============================================================
// 基础工厂
// ============================================================
const iconProps = { size: 18, fill: 'currentColor', theme: 'outline' as const }
const icon = (Comp: React.ComponentType<Record<string, unknown>>) =>
  React.createElement(Comp, iconProps)

// ============================================================
// 侧边栏图标映射
// ============================================================
export const SIDEBAR_ICONS: Record<string, React.ReactNode> = {
  chat: icon(Message),
  skills: icon(Lightning),
  workflow: icon(Refresh),
  'knowledge-base': icon(Read),
  translator: icon(Globe),
  shortcuts: icon(Keyboard),
  'clipboard-history': icon(Clipboard),
  notifications: icon(Notice),
  'multi-session': icon(MessageOne),
  calendar: icon(Calendar),
  'quick-preview': icon(PreviewOpen),
  'system-dashboard': icon(ChartLine),
  'theme-store': icon(Theme),
  'code-snippets': icon(Scissor),
  modules: icon(AllApplication),
  settings: icon(SettingOne),
  live2d: icon(Cat),
  live2d5: icon(Drama),
}

// ============================================================
// 模块占位页图标映射
// ============================================================
export const MODULE_PAGE_ICONS: Record<string, React.ReactNode> = {
  workflow: icon(Refresh),
  'knowledge-base': icon(BookOpen),
  translator: icon(Globe),
  memory: icon(Brain),
  task: icon(ListOne),
  vision: icon(Eyes),
  screen: icon(Monitor),
  proactive: icon(Heart),
}

// ============================================================
// 状态图标（size=14，用于行内状态标记）
// ============================================================
const sm = { size: 14, fill: 'currentColor', theme: 'outline' as const }
const md = { size: 16, fill: 'currentColor', theme: 'outline' as const }

export const STATUS_ICONS = {
  loading: React.createElement(LoadingFour, { ...sm, fill: '#6b7280' }),
  success: React.createElement(CheckOne, { ...sm, fill: '#10b981' }),
  error: React.createElement(CloseOne, { ...sm, fill: '#ef4444' }),
  warning: React.createElement(Warning, { ...sm, fill: '#f59e0b' }),
  info: React.createElement(Tips, { ...sm, fill: '#3b82f6' }),
} as const

// ============================================================
// 主题切换图标
// ============================================================
export const THEME_ICONS: Record<string, React.ReactNode> = {
  light: icon(Sun),
  dark: icon(Moon),
  system: icon(Computer),
  compact: icon(Square),
}

// ============================================================
// 通用操作图标
// ============================================================
export const ACTION_ICONS = {
  search: icon(Search),
  link: icon(LinkFour),
  play: icon(PlayOne),
  pause: icon(PauseOne),
  time: icon(Time),
  inbox: icon(Inbox),
  star: icon(Star),
  starFilled: React.createElement(Star, { ...iconProps, fill: '#f59e0b', theme: 'filled' }),
  document: icon(Document),
  folder: icon(FolderOpen),
  chart: icon(ChartHistogram),
  data: icon(Data),
  image: icon(Pic),
  plug: icon(Plug),
  help: icon(Help),
  tips: icon(Tips),
  clipboard: icon(Clipboard),
  refresh: icon(Refresh),
  inboxLarge: React.createElement(Inbox, { size: 48, fill: 'currentColor', theme: 'outline' }),
}

// ============================================================
// 空状态图标（size=32，用于 ModuleList emptyIcon）
// ============================================================
const lg = { size: 32, fill: '#9ca3af', theme: 'outline' as const }

export const EMPTY_ICONS: Record<string, React.ReactNode> = {
  default: React.createElement(Inbox, lg),
  inbox: React.createElement(Inbox, lg),
  chat: React.createElement(Message, lg),
  bell: React.createElement(Notice, lg),
  star: React.createElement(Star, lg),
  search: React.createElement(Search, lg),
  document: React.createElement(Document, lg),
  clipboard: React.createElement(Clipboard, lg),
  globe: React.createElement(Globe, lg),
  refresh: React.createElement(Refresh, lg),
  scissors: React.createElement(Scissor, lg),
  book: React.createElement(BookOpen, lg),
  plug: React.createElement(Plug, lg),
  chart: React.createElement(ChartHistogram, lg),
  folder: React.createElement(FolderOpen, lg),
  setting: React.createElement(SettingOne, lg),
}

// ============================================================
// 通用页面/组件图标（size=16，用于页面内业务图标）
// ============================================================

export const PAGE_ICONS = {
  /** 知识库 */
  bookOpen: React.createElement(BookOpen, md),
  search: React.createElement(Search, md),
  tips: React.createElement(Tips, md),
  download: React.createElement(DownloadOne, md),
  folderOpen: React.createElement(FolderOpen, md),

  /** 工作流 */
  read: React.createElement(Read, md),
  refresh: React.createElement(Refresh, md),
  clipboard: React.createElement(Clipboard, md),
  folder: React.createElement(FolderOpen, md),
  magic: React.createElement(Magic, md),
  play: React.createElement(PlayOne, md),
  pause: React.createElement(PauseOne, md),
  monitor: React.createElement(Monitor, md),

  /** 翻译 */
  globe: React.createElement(Globe, md),
  star: React.createElement(Star, md),

  /** 设置 */
  setting: React.createElement(SettingOne, md),
  robot: React.createElement(Robot, md),
  brain: React.createElement(Brain, md),
  chart: React.createElement(ChartHistogram, md),

  /** Live2D */
  cat: React.createElement(Cat, md),
  drama: React.createElement(Drama, md),
  help: React.createElement(Help, md),
  close: React.createElement(CloseOne, md),
  magicSm: React.createElement(Magic, sm),

  /** 代码片段 */
  scissors: React.createElement(Scissor, md),

  /** 通知 */
  notice: React.createElement(Notice, md),
  check: React.createElement(CheckOne, md),

  /** 快捷预览 */
  preview: React.createElement(PreviewOpen, md),
  eyes: React.createElement(Eyes, md),

  /** 模块管理 */
  folderOpenSm: React.createElement(FolderOpen, sm),

  /** 主题商店 */
  sun: React.createElement(Sun, md),
  moon: React.createElement(Moon, md),
  downloadOne: React.createElement(DownloadOne, md),
  deleteOne: React.createElement(DeleteOne, md),
}

// ============================================================
// 通用操作图标（size=14，用于行内操作按钮）
// ============================================================
export const ACTION_ICONS_SM = {
  delete: React.createElement(DeleteOne, sm),
  edit: React.createElement(EditOne, sm),
  copy: React.createElement(Clipboard, sm),
  folder: React.createElement(FolderOpen, sm),
  refresh: React.createElement(Refresh, sm),
  pushpin: React.createElement(Pushpin, sm),
  location: React.createElement(Location, sm),
  fire: React.createElement(Fire, sm),
  recycle: React.createElement(Recycle, sm),
  magic: React.createElement(Magic, sm),
  download: React.createElement(DownloadOne, sm),
}

// ============================================================
// 状态 Emoji（string setMessage 用）
// ============================================================
export const StatusEmoji = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  loading: '⏳',
} as const

// ============================================================
// 通用操作结果消息（string 版本，用于 setMessage）
// ============================================================
export const Msg = {
  /** 网络断开 */
  offline: '⚠️ 当前处于断网状态，无法执行此操作。请先在设置中开启联网功能',
  offlineImport: '⚠️ 当前处于断网状态，无法从网络地址导入。请使用本地路径或开启联网功能',
  offlineDataset: '⚠️ 当前处于断网状态，无法加载远程数据集。请先在设置中开启联网功能',
  offlineDownload: '⚠️ 当前处于断网状态，无法下载数据集。请先在设置中开启联网功能',

  /** 通用操作结果 */
  saveSuccess: '✅ 保存成功',
  saveFailed: '❌ 保存失败',
  deleteSuccess: '✅ 删除成功',
  deleteFailed: '❌ 删除失败',
  copySuccess: '✅ 已复制到剪贴板',
  copyFailed: '❌ 复制失败',
  importSuccess: (s: number, f: number) => `✅ 导入完成：${s} 成功，${f} 失败`,
  importFailed: (err: string) => `❌ 导入失败：${err}`,
  exportSuccess: '✅ 导出成功',
  exportFailed: (err: string) => `❌ 导出失败：${err}`,
  loadFailed: (err: string) => `❌ 加载失败：${err}`,
  switchFailed: (err: string) => `❌ 切换失败：${err}`,
  error: (err: string) => `❌ 错误：${err}`,

  /** 联网切换 */
  networkOn: '✅ 联网功能已开启',
  networkOff: '⚠️ 联网功能已关闭（本地文件操作和已有向量搜索不受影响）',

  /** 下载相关 */
  downloadComplete: (name: string) => `✅ "${name}" 下载完成！`,
  downloadCancelled: (name: string) => `"${name}" 下载已取消`,
  downloadInterrupted: (name: string) => `⚠️ "${name}" 下载中断`,
  downloadCompleteGeneric: '✅ 下载完成',
  downloading: '⏳ 下载中...',
  preparing: '⏳ 准备中...',

  /** 工作流 */
  workflowSuccess: '✅ 成功',
  workflowFailed: '❌ 失败',
  workflowRunning: '⏳ 运行中',

  /** 完成 */
  completed: '✅ 已完成',
} as const

// ============================================================
// 原始图标组件 re-export
// 供需要 React.createElement(Icon, {...}) 自定义尺寸/颜色的场景使用
// 优先使用上方的 PAGE_ICONS / ACTION_ICONS_SM / STATUS_ICONS 等预设对象
// ============================================================
export {
  // 侧边栏
  Message, Lightning, Refresh, Read, Globe, Keyboard, Clipboard,
  Notice, MessageOne, Calendar, PreviewOpen, ChartLine, Theme,
  Scissor, AllApplication, SettingOne, Cat, Drama,
  // 模块
  BookOpen, Brain, ListOne, Eyes, Monitor, Heart,
  // 操作
  Search, LinkFour, PlayOne, PauseOne, Time, Inbox, Star,
  Document, FolderOpen, LoadingFour, CheckOne, CloseOne,
  Help, Tips, Warning, Plug, ChartHistogram, Data, Pic,
  Computer, Sun, Moon, Square, FullScreenPlay,
  // 扩展
  Robot, Magic, DeleteOne, DownloadOne, EditOne,
  Fire, Recycle, Pushpin, Location, Database,
}

/**
 * IconPark 图标统一映射
 * 将项目中所有 emoji 图标语义平替为字节跳动 IconPark 图标
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
  Plug,
  ChartHistogram,
  Data,
  Pic,
  Computer,
  Sun,
  Moon,
  Square,
  FullScreenPlay,
} from '@icon-park/react'

/** 图标公共属性 */
const iconProps = { size: 18, fill: 'currentColor', theme: 'outline' as const }

/** 创建图标元素的快捷方式 */
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
// 状态图标映射
// ============================================================
export const STATUS_ICONS = {
  loading: icon(LoadingFour),
  success: icon(CheckOne),
  error: icon(CloseOne),
  warning: icon(Help),
  info: icon(Tips),
} as const

// ============================================================
// 主题切换图标映射
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
// 空状态图标映射（用于 ModuleList emptyIcon）
// ============================================================
export const EMPTY_ICONS: Record<string, React.ReactNode> = {
  default: React.createElement(Inbox, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  inbox: React.createElement(Inbox, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  chat: React.createElement(Message, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  bell: React.createElement(Notice, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  star: React.createElement(Star, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  search: React.createElement(Search, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  document: React.createElement(Document, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  clipboard: React.createElement(Clipboard, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  globe: React.createElement(Globe, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  refresh: React.createElement(Refresh, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  scissors: React.createElement(Scissor, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  book: React.createElement(BookOpen, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  plug: React.createElement(Plug, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  chart: React.createElement(ChartHistogram, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  package: React.createElement(FolderOpen, { size: 32, fill: '#9ca3af', theme: 'outline' }),
  setting: React.createElement(SettingOne, { size: 32, fill: '#9ca3af', theme: 'outline' }),
}

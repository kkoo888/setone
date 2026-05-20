/**
 * Git 与文件浏览 IPC 处理器
 * git:status / git:diff / files:list / files:read / files:readAny / files:openPicker / dialog:openFile
 * + 辅助函数：detectLanguage / isMarkdown / runGit / parseGitStatus / buildFileTree
 */
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { readdir, stat, readFile } from 'node:fs/promises'
import type { HandlerDeps } from './types'

/** 项目根目录（开发模式下向上两级） */
const projectRoot = join(__dirname, '../../')

/** 排除的目录/文件名 */
const EXCLUDED_NAMES = new Set(['node_modules', '.git', 'dist', 'dist-packaged', '.DS_Store'])

/**
 * 根据文件扩展名判断语言
 * @param filePath - 文件路径
 * @returns 语言标识
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', markdown: 'markdown',
    css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    yaml: 'yaml', yml: 'yaml', toml: 'toml',
    xml: 'xml', svg: 'svg', sql: 'sql',
    txt: 'text', log: 'text', gitignore: 'text', env: 'text'
  }
  return map[ext] ?? 'text'
}

/**
 * 判断是否为 Markdown 文件
 * @param filePath - 文件路径
 */
function isMarkdown(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'md' || ext === 'markdown'
}

/**
 * 执行 git 命令
 * @param args - git 命令参数
 * @returns 命令输出
 */
function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: projectRoot, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * 解析 git status --porcelain 输出
 * @param output - git status 输出
 * @returns 变更文件列表
 */
function parseGitStatus(output: string): Array<{ path: string; status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'; staged: boolean }> {
  if (!output.trim()) return []
  return output.trim().split('\n').map((line) => {
    const indexStatus = line[0]
    const workTreeStatus = line[1]
    const filePath = line.slice(3).trim()

    let status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
    let staged = false

    if (indexStatus === '?' && workTreeStatus === '?') {
      status = 'untracked'
    } else if (indexStatus === 'A') {
      status = 'added'
      staged = true
    } else if (indexStatus === 'D' || workTreeStatus === 'D') {
      status = 'deleted'
      staged = indexStatus === 'D'
    } else if (indexStatus === 'R') {
      status = 'renamed'
      staged = true
    } else if (indexStatus === 'M' || workTreeStatus === 'M') {
      status = 'modified'
      staged = indexStatus === 'M'
    } else {
      status = 'modified'
    }

    return { path: filePath, status, staged }
  })
}

/**
 * 递归读取目录，构建文件树
 * @param dirPath - 目录路径
 * @param depth - 当前递归深度
 * @param maxDepth - 最大递归深度
 * @returns 文件树节点数组
 */
async function buildFileTree(dirPath: string, depth: number, maxDepth: number): Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>> {
  if (depth >= maxDepth) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const result: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> = []

  // 排序：目录在前，文件在后，按名称排序
  const sorted = entries
    .filter((e) => !EXCLUDED_NAMES.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

  for (const entry of sorted) {
    const fullPath = join(dirPath, entry.name)
    const relativePath = fullPath.replace(projectRoot, '')

    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath, depth + 1, maxDepth)
      result.push({ name: entry.name, path: relativePath, type: 'directory', children })
    } else {
      result.push({ name: entry.name, path: relativePath, type: 'file' })
    }
  }

  return result
}

/**
 * 注册 Git 与文件浏览相关 IPC 处理器
 * @param deps - 共享依赖
 */
export function registerGitFileHandlers(deps: HandlerDeps): void {
  const { logger } = deps

  /** 获取 git 变更列表 */
  ipcMain.handle('git:status', async () => {
    try {
      const output = await runGit(['status', '--porcelain'])
      return parseGitStatus(output)
    } catch (err) {
      logger.warn('git status 执行失败', err as Error)
      return []
    }
  })

  /** 获取文件差异 */
  ipcMain.handle('git:diff', async (_event, args: { file: string }) => {
    try {
      return await runGit(['diff', args.file])
    } catch (err) {
      logger.warn('git diff 执行失败', err as Error)
      return ''
    }
  })

  /** 列出项目文件树 */
  ipcMain.handle('files:list', async () => {
    try {
      return await buildFileTree(projectRoot, 0, 3)
    } catch (err) {
      logger.warn('文件树加载失败', err as Error)
      return []
    }
  })

  /** 读取文件内容 */
  ipcMain.handle('files:read', async (_event, args: { path: string }) => {
    try {
      const fullPath = join(projectRoot, args.path)
      const fileStat = await stat(fullPath)
      const MAX_SIZE = 100 * 1024 // 100KB

      if (fileStat.size > MAX_SIZE) {
        return {
          content: '',
          language: detectLanguage(args.path),
          isMarkdown: false,
          tooLarge: true
        }
      }

      const content = await readFile(fullPath, 'utf-8')
      return {
        content,
        language: detectLanguage(args.path),
        isMarkdown: isMarkdown(args.path),
        tooLarge: false
      }
    } catch (err) {
      logger.warn(`文件读取失败: ${args.path}`, err as Error)
      throw new Error(`无法读取文件: ${args.path}`)
    }
  })

  /** 读取任意路径文件（用于聊天附件） */
  ipcMain.handle('files:readAny', async (_event, args: { path: string }) => {
    try {
      const fileStat = await stat(args.path)
      const MAX_SIZE = 200 * 1024 // 200KB
      if (fileStat.size > MAX_SIZE) {
        return { success: false, error: `文件过大 (${(fileStat.size / 1024).toFixed(0)}KB)，最大支持 200KB` }
      }
      const content = await readFile(args.path, 'utf-8')
      const name = args.path.split(/[\\/]/).pop() ?? args.path
      return { success: true, name, content, size: fileStat.size }
    } catch (err) {
      return { success: false, error: `无法读取文件: ${(err as Error).message}` }
    }
  })

  /** 打开文件选择对话框 */
  ipcMain.handle('files:openPicker', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: '选择文件',
      properties: ['openFile'],
      filters: [
        { name: '文本文件', extensions: ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'ini', 'sh', 'bat', 'log', 'csv', 'sql'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    const filePath = result.filePaths[0]
    try {
      const fileStat = await stat(filePath)
      const MAX_SIZE = 200 * 1024
      if (fileStat.size > MAX_SIZE) {
        return { canceled: false, error: `文件过大 (${(fileStat.size / 1024).toFixed(0)}KB)，最大支持 200KB` }
      }
      const content = await readFile(filePath, 'utf-8')
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      return { canceled: false, name, content }
    } catch (err) {
      return { canceled: false, error: (err as Error).message }
    }
  })

  /** 通用文件/目录选择对话框 */
  ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: Electron.FileFilter[]; properties?: string[] }) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: options?.properties?.includes('openDirectory') ? '选择目录' : '选择文件',
      properties: (options?.properties as Electron.OpenDialogOptions['properties']) ?? ['openFile'],
      filters: options?.filters
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    return { canceled: false, filePaths: result.filePaths }
  })
}

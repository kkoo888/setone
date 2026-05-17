import type { Logger } from '../../../src/main/types/logger'
import { execSync } from 'child_process'
import { platform } from 'os'

/** 当前平台 */
type Platform = 'win32' | 'darwin' | 'linux'

/**
 * 键盘控制服务
 * 通过系统命令实现键盘操作，支持 Windows/macOS/Linux 三平台
 * 优先尝试加载 robotjs（如果已安装），否则降级到系统命令
 */
export class KeyboardService {
  private logger: Logger
  private platform: Platform
  /** robotjs 实例（如果可用） */
  private robot: ReturnType<typeof tryLoadRobotjs> = null

  constructor(logger: Logger) {
    this.logger = logger
    this.platform = platform() as Platform
    // 尝试加载 robotjs（如果已安装）
    this.robot = tryLoadRobotjs()
    if (this.robot) {
      this.logger.info('KeyboardService: 使用 robotjs 驱动')
    } else {
      this.logger.info(`KeyboardService: 使用系统命令驱动 (${this.platform})`)
    }
  }

  /**
   * 输入文字
   * @param text 要输入的文字内容
   */
  type(text: string): void {
    this.logger.info(`键盘输入: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`)
    if (this.robot) {
      this.robot.typeString(text)
      return
    }
    this.typeByCommand(text)
  }

  /**
   * 按下单个键
   * @param key 按键名称（如 'enter', 'tab', 'a', 'escape' 等）
   */
  pressKey(key: string): void {
    this.logger.info(`按键: ${key}`)
    if (this.robot) {
      this.robot.keyTap(key)
      return
    }
    this.pressKeyByCommand(key)
  }

  /**
   * 执行快捷键组合
   * @param keys 按键数组，如 ['ctrl', 'c'] 或 ['cmd', 'shift', 's']
   */
  shortcut(keys: string[]): void {
    this.logger.info(`快捷键: ${keys.join('+')}`)
    if (this.robot) {
      const modifier = keys.slice(0, -1)
      const mainKey = keys[keys.length - 1]
      this.robot.keyTap(mainKey, modifier)
      return
    }
    this.shortcutByCommand(keys)
  }

  /**
   * 按住按键
   * @param key 按键名称
   */
  keyDown(key: string): void {
    this.logger.debug(`按下: ${key}`)
    if (this.robot) {
      this.robot.keyToggle(key, 'down')
      return
    }
    this.keyToggleByCommand(key, 'down')
  }

  /**
   * 释放按键
   * @param key 按键名称
   */
  keyUp(key: string): void {
    this.logger.debug(`释放: ${key}`)
    if (this.robot) {
      this.robot.keyToggle(key, 'up')
      return
    }
    this.keyToggleByCommand(key, 'up')
  }

  // ========== 系统命令实现 ==========

  /** 通过系统命令输入文字 */
  private typeByCommand(text: string): void {
    try {
      switch (this.platform) {
        case 'linux':
          execSync(`xdotool type --delay 0 ${shellEscape(text)}`, { timeout: 10000 })
          break

        case 'darwin':
          // osascript 输入中文和特殊字符
          execSync(
            `osascript -e 'tell application "System Events" to keystroke ${osascriptEscape(text)}'`,
            { timeout: 10000 }
          )
          break

        case 'win32':
          // PowerShell SendKeys
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${powershellEscape(text)})"`,
            { timeout: 10000 }
          )
          break
      }
    } catch (e) {
      this.logger.error(`键盘输入失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`键盘输入失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令按下单个键 */
  private pressKeyByCommand(key: string): void {
    try {
      const xdoKey = toXdotoolKey(key)
      switch (this.platform) {
        case 'linux':
          execSync(`xdotool key ${xdoKey}`, { timeout: 5000 })
          break

        case 'darwin': {
          const osaKey = toOsascriptKey(key)
          execSync(
            `osascript -e 'tell application "System Events" to key code ${osaKey.code}${osaKey.modifier ? ' using {${osaKey.modifier}}' : ''}'`,
            { timeout: 5000 }
          )
          break
        }

        case 'win32': {
          const psKey = toPowershellKey(key)
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psKey}')"`,
            { timeout: 5000 }
          )
          break
        }
      }
    } catch (e) {
      this.logger.error(`按键失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`按键失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令执行快捷键组合 */
  private shortcutByCommand(keys: string[]): void {
    try {
      const modifiers = keys.slice(0, -1)
      const mainKey = keys[keys.length - 1]

      switch (this.platform) {
        case 'linux': {
          const xdoMod = modifiers.map((m) => toXdotoolModifier(m)).join('+')
          const xdoKey = toXdotoolKey(mainKey)
          execSync(`xdotool key ${xdoMod}+${xdoKey}`, { timeout: 5000 })
          break
        }

        case 'darwin': {
          const osaKey = toOsascriptKey(mainKey)
          const osaMod = modifiers.map((m) => toOsascriptModifier(m)).join(', ')
          execSync(
            `osascript -e 'tell application "System Events" to key code ${osaKey.code} using {${osaMod}}'`,
            { timeout: 5000 }
          )
          break
        }

        case 'win32': {
          const psMod = modifiers.map((m) => toPowershellModifier(m)).join('')
          const psKey = toPowershellKey(mainKey)
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psMod}${psKey}')"`,
            { timeout: 5000 }
          )
          break
        }
      }
    } catch (e) {
      this.logger.error(`快捷键执行失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`快捷键执行失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令切换按键状态 */
  private keyToggleByCommand(key: string, direction: 'down' | 'up'): void {
    try {
      const xdoKey = toXdotoolKey(key)
      switch (this.platform) {
        case 'linux':
          execSync(`xdotool key${direction} ${xdoKey}`, { timeout: 5000 })
          break

        case 'darwin': {
          const osaKey = toOsascriptKey(key)
          const osaDir = direction === 'down' ? 'key down' : 'key up'
          execSync(
            `osascript -e 'tell application "System Events" to ${osaDir} ${osaKey.code}'`,
            { timeout: 5000 }
          )
          break
        }

        case 'win32':
          this.logger.warn('Windows 平台不支持单独的按键按下/释放操作')
          break
      }
    } catch (e) {
      this.logger.error(`按键切换失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

// ========== 按键映射工具函数 ==========

/** 将通用按键名转换为 xdotool 按键名 */
function toXdotoolKey(key: string): string {
  const map: Record<string, string> = {
    enter: 'Return',
    return: 'Return',
    tab: 'Tab',
    space: 'space',
    backspace: 'BackSpace',
    delete: 'Delete',
    escape: 'Escape',
    esc: 'Escape',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    home: 'Home',
    end: 'End',
    pageup: 'Page_Up',
    pagedown: 'Page_Down',
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
    f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
  }
  return map[key.toLowerCase()] || key
}

/** 将通用按键名转换为 xdotool 修饰键 */
function toXdotoolModifier(key: string): string {
  const map: Record<string, string> = {
    ctrl: 'ctrl',
    control: 'ctrl',
    alt: 'alt',
    shift: 'shift',
    cmd: 'super',
    command: 'super',
    meta: 'super',
    win: 'super',
  }
  return map[key.toLowerCase()] || key
}

/** 将通用按键名转换为 osascript 键码 */
function toOsascriptKey(key: string): { code: string; modifier?: string } {
  const map: Record<string, string> = {
    enter: '36',
    return: '36',
    tab: '48',
    space: '49',
    backspace: '51',
    delete: '117',
    escape: '53',
    esc: '53',
    up: '126',
    down: '125',
    left: '123',
    right: '124',
    home: '115',
    end: '119',
    pageup: '116',
    pagedown: '121',
    f1: '122', f2: '120', f3: '99', f4: '118', f5: '96', f6: '97',
    f7: '98', f8: '100', f9: '101', f10: '109', f11: '103', f12: '111',
  }
  const code = map[key.toLowerCase()]
  if (code) return { code }
  // 普通字母键
  if (key.length === 1) {
    const charCode = key.toLowerCase().charCodeAt(0) - 97 + 0 // a=0, b=11, ...
    const letterMap: Record<string, string> = {
      a: '0', b: '11', c: '8', d: '2', e: '14', f: '3', g: '5', h: '4',
      i: '34', j: '38', k: '40', l: '37', m: '46', n: '45', o: '31',
      p: '35', q: '12', r: '15', s: '1', t: '17', u: '32', v: '9',
      w: '13', x: '7', y: '16', z: '6',
    }
    const lc = key.toLowerCase()
    return { code: letterMap[lc] || String(charCode) }
  }
  return { code: '0' }
}

/** 将通用修饰键转换为 osascript 修饰键名 */
function toOsascriptModifier(key: string): string {
  const map: Record<string, string> = {
    ctrl: 'control down',
    control: 'control down',
    alt: 'option down',
    shift: 'shift down',
    cmd: 'command down',
    command: 'command down',
    meta: 'command down',
    win: 'command down',
  }
  return map[key.toLowerCase()] || `${key} down`
}

/** 将通用按键名转换为 PowerShell SendKeys 按键 */
function toPowershellKey(key: string): string {
  const map: Record<string, string> = {
    enter: '{ENTER}',
    return: '{ENTER}',
    tab: '{TAB}',
    space: ' ',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    escape: '{ESC}',
    esc: '{ESC}',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
    f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}', f6: '{F6}',
    f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}', f11: '{F11}', f12: '{F12}',
    insert: '{INSERT}',
    printscreen: '{PRTSC}',
  }
  return map[key.toLowerCase()] || key
}

/** 将通用修饰键转换为 PowerShell SendKeys 修饰符 */
function toPowershellModifier(key: string): string {
  const map: Record<string, string> = {
    ctrl: '^',
    control: '^',
    alt: '%',
    shift: '+',
    cmd: '^',
    command: '^',
    meta: '^',
    win: '^',
  }
  return map[key.toLowerCase()] || ''
}

/** Shell 转义（用于 xdotool type） */
function shellEscape(text: string): string {
  // 使用单引号包裹，内部单引号替换为 '\''
  return `'${text.replace(/'/g, "'\\''")}'`
}

/** osascript 字符串转义 */
function osascriptEscape(text: string): string {
  // 使用双引号包裹，转义内部双引号和反斜杠
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** PowerShell 字符串转义 */
function powershellEscape(text: string): string {
  // 使用单引号包裹 PowerShell 字符串
  return `'${text.replace(/'/g, "''")}'`
}

/**
 * 尝试动态加载 robotjs（如果已安装）
 * @returns robotjs 实例或 null
 */
function tryLoadRobotjs(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('robotjs')
  } catch {
    return null
  }
}

import type { Logger } from '../../../src/main/types/logger'
import { execSync } from 'child_process'
import { platform } from 'os'

export interface Position { x: number; y: number }

/** 当前平台 */
type Platform = 'win32' | 'darwin' | 'linux'

/**
 * 鼠标控制服务
 * 通过系统命令实现鼠标操作，支持 Windows/macOS/Linux 三平台
 * 优先尝试加载 robotjs（如果已安装），否则降级到系统命令
 */
export class MouseService {
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
      this.logger.info('MouseService: 使用 robotjs 驱动')
    } else {
      this.logger.info(`MouseService: 使用系统命令驱动 (${this.platform})`)
    }
  }

  /**
   * 获取鼠标位置
   * @returns 当前鼠标坐标
   */
  getPosition(): Position {
    if (this.robot) {
      const pos = this.robot.getMousePos()
      return { x: pos.x, y: pos.y }
    }
    return this.getPositionByCommand()
  }

  /**
   * 移动鼠标到指定位置
   * @param x X 坐标
   * @param y Y 坐标
   */
  move(x: number, y: number): void {
    this.logger.debug(`鼠标移动: (${x}, ${y})`)
    if (this.robot) {
      this.robot.moveMouse(x, y)
      return
    }
    this.moveByCommand(x, y)
  }

  /**
   * 点击鼠标
   * @param x X 坐标
   * @param y Y 坐标
   * @param button 鼠标按键（left/right/middle）
   */
  click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): void {
    this.logger.info(`鼠标点击: (${x}, ${y}) ${button}`)
    if (this.robot) {
      this.robot.moveMouse(x, y)
      this.robot.mouseClick(button)
      return
    }
    this.clickByCommand(x, y, button)
  }

  /**
   * 双击鼠标
   * @param x X 坐标
   * @param y Y 坐标
   */
  doubleClick(x: number, y: number): void {
    this.logger.info(`鼠标双击: (${x}, ${y})`)
    if (this.robot) {
      this.robot.moveMouse(x, y)
      this.robot.mouseClick('left', true)
      return
    }
    this.doubleClickByCommand(x, y)
  }

  /**
   * 拖拽鼠标
   * @param from 起始位置
   * @param to 目标位置
   */
  drag(from: Position, to: Position): void {
    this.logger.info(`鼠标拖拽: (${from.x},${from.y}) → (${to.x},${to.y})`)
    if (this.robot) {
      this.robot.moveMouse(from.x, from.y)
      this.robot.mouseToggle('down')
      this.robot.moveMouse(to.x, to.y)
      this.robot.mouseToggle('up')
      return
    }
    this.dragByCommand(from, to)
  }

  /**
   * 鼠标滚轮
   * @param amount 滚动量（正数向上，负数向下）
   */
  scroll(amount: number): void {
    this.logger.debug(`鼠标滚动: ${amount}`)
    if (this.robot) {
      this.robot.scrollMouse(0, amount)
      return
    }
    this.scrollByCommand(amount)
  }

  // ========== 系统命令实现 ==========

  /** 通过系统命令获取鼠标位置 */
  private getPositionByCommand(): Position {
    try {
      let output: string
      switch (this.platform) {
        case 'win32':
          output = execSync(
            'powershell -Command "[System.Windows.Forms.Cursor]::Position"',
            { encoding: 'utf-8', timeout: 5000 }
          )
          // 解析 "X=123, Y=456" 格式
          const winMatch = output.match(/X=(\d+),\s*Y=(\d+)/)
          if (winMatch) return { x: parseInt(winMatch[1]), y: parseInt(winMatch[2]) }
          break

        case 'darwin':
          output = execSync(
            `osascript -e 'tell application "System Events" to get position of mouse cursor'`,
            { encoding: 'utf-8', timeout: 5000 }
          )
          // 解析 "123, 456" 格式
          const macMatch = output.trim().match(/(\d+),\s*(\d+)/)
          if (macMatch) return { x: parseInt(macMatch[1]), y: parseInt(macMatch[2]) }
          break

        case 'linux':
          output = execSync('xdotool getmouselocation', { encoding: 'utf-8', timeout: 5000 })
          // 解析 "x:123 y:456 screen:0 window:0" 格式
          const linuxMatch = output.match(/x:(\d+)\s+y:(\d+)/)
          if (linuxMatch) return { x: parseInt(linuxMatch[1]), y: parseInt(linuxMatch[2]) }
          break
      }
    } catch (e) {
      this.logger.warn(`获取鼠标位置失败: ${e instanceof Error ? e.message : String(e)}`)
    }
    return { x: 0, y: 0 }
  }

  /** 通过系统命令移动鼠标 */
  private moveByCommand(x: number, y: number): void {
    try {
      switch (this.platform) {
        case 'win32':
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})"`,
            { timeout: 5000 }
          )
          break

        case 'darwin':
          execSync(
            `osascript -e 'tell application "System Events" to set position of mouse cursor to {${x}, ${y}}'`,
            { timeout: 5000 }
          )
          break

        case 'linux':
          execSync(`xdotool mousemove ${x} ${y}`, { timeout: 5000 })
          break
      }
    } catch (e) {
      this.logger.error(`鼠标移动失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`鼠标移动失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令点击鼠标 */
  private clickByCommand(x: number, y: number, button: 'left' | 'right' | 'middle'): void {
    // 先移动鼠标
    this.moveByCommand(x, y)
    try {
      switch (this.platform) {
        case 'win32': {
          const btnMap = { left: 'Left', right: 'Right', middle: 'Middle' }
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${btnMap[button]}}')"`,
            { timeout: 5000 }
          )
          break
        }

        case 'darwin': {
          const btnMap = { left: '', right: 'right ', middle: 'middle ' }
          execSync(
            `osascript -e 'tell application "System Events" to ${btnMap[button]}click at {${x}, ${y}}'`,
            { timeout: 5000 }
          )
          break
        }

        case 'linux': {
          const btnMap = { left: '1', middle: '2', right: '3' }
          execSync(`xdotool mousemove ${x} ${y} click ${btnMap[button]}`, { timeout: 5000 })
          break
        }
      }
    } catch (e) {
      this.logger.error(`鼠标点击失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`鼠标点击失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令双击鼠标 */
  private doubleClickByCommand(x: number, y: number): void {
    this.moveByCommand(x, y)
    try {
      switch (this.platform) {
        case 'win32':
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{{LEFT}{LEFT}}')"`,
            { timeout: 5000 }
          )
          break

        case 'darwin':
          execSync(
            `osascript -e 'tell application "System Events" to click at {${x}, ${y}}' -e 'delay 0.05' -e 'tell application "System Events" to click at {${x}, ${y}}'`,
            { timeout: 5000 }
          )
          break

        case 'linux':
          execSync(`xdotool mousemove ${x} ${y} click --repeat 2 1`, { timeout: 5000 })
          break
      }
    } catch (e) {
      this.logger.error(`鼠标双击失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`鼠标双击失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令拖拽 */
  private dragByCommand(from: Position, to: Position): void {
    try {
      switch (this.platform) {
        case 'linux':
          execSync(`xdotool mousemove ${from.x} ${from.y} mousedown 1 mousemove ${to.x} ${to.y} mouseup 1`, { timeout: 10000 })
          break

        case 'darwin':
          execSync(
            `osascript -e 'tell application "System Events"' -e 'set position of mouse cursor to {${from.x}, ${from.y}}' -e 'key down 56' -e 'delay 0.1' -e 'set position of mouse cursor to {${to.x}, ${to.y}}' -e 'delay 0.1' -e 'key up 56' -e 'end tell'`,
            { timeout: 10000 }
          )
          break

        case 'win32':
          // Windows 拖拽通过 PowerShell 模拟
          this.moveByCommand(from.x, from.y)
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{LEFT DOWN}')"`,
            { timeout: 5000 }
          )
          this.moveByCommand(to.x, to.y)
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{LEFT UP}')"`,
            { timeout: 5000 }
          )
          break
      }
    } catch (e) {
      this.logger.error(`鼠标拖拽失败: ${e instanceof Error ? e.message : String(e)}`)
      throw new Error(`鼠标拖拽失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 通过系统命令滚动 */
  private scrollByCommand(amount: number): void {
    try {
      switch (this.platform) {
        case 'linux':
          execSync(`xdotool click ${amount > 0 ? '4' : '5'}`, { timeout: 5000 })
          break

        case 'darwin':
          execSync(
            `osascript -e 'tell application "System Events" to scroll area 1 of window 1 by {0, ${amount}}'`,
            { timeout: 5000 }
          )
          break

        case 'win32':
          execSync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${amount > 0 ? 'UP' : 'DOWN'}}')"`,
            { timeout: 5000 }
          )
          break
      }
    } catch (e) {
      this.logger.warn(`鼠标滚动失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
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

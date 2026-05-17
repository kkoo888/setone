import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { cpus, totalmem, freemem, uptime, platform, hostname } from 'os'

export default class SystemDashboardModule implements Module {
  id = 'system-dashboard'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    context.logger.info('系统仪表盘模块已激活')
  }

  async deactivate(): Promise<void> { this.context.logger.info('系统仪表盘模块已停用') }

  private getCpuUsage(): number {
    const cpuList = cpus()
    let totalIdle = 0, totalTick = 0
    for (const cpu of cpuList) {
      for (const type in cpu.times) { totalTick += (cpu.times as Record<string, number>)[type] }
      totalIdle += cpu.times.idle
    }
    return Math.round((1 - totalIdle / totalTick) * 1000) / 10
  }

  private async getDiskUsage(): Promise<{ used: number; total: number; percent: number }> {
    try {
      const { execSync } = require('child_process')
      const isWin = platform() === 'win32'
      const cmd = isWin ? 'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /format:csv' : 'df -B1 / | tail -1'
      const out = execSync(cmd, { encoding: 'utf-8' }).trim()
      if (isWin) {
        const parts = out.split('\n').pop()?.split(',').filter(Boolean) ?? []
        const free = parseInt(parts[1] ?? '0'), size = parseInt(parts[2] ?? '0')
        return { used: size - free, total: size, percent: size > 0 ? Math.round((size - free) / size * 100) : 0 }
      }
      const parts = out.split(/\s+/)
      const total = parseInt(parts[1] ?? '0'), used = parseInt(parts[2] ?? '0')
      return { used, total, percent: total > 0 ? Math.round(used / total * 100) : 0 }
    } catch { return { used: 0, total: 0, percent: 0 } }
  }

  getCapabilities(): Capability[] {
    return [
      { type: 'tool', name: 'system_info', description: '获取系统信息', priority: 10, moduleId: this.id, handler: {
        execute: async () => {
          const totalMem = totalmem(), freeMem = freemem(), usedMem = totalMem - freeMem
          const disk = await this.getDiskUsage()
          return {
            success: true,
            data: {
              cpu: this.getCpuUsage(),
              memory: { used: usedMem, total: totalMem, percent: Math.round(usedMem / totalMem * 100) },
              disk,
              uptime: uptime(),
              platform: platform(),
              hostname: hostname()
            }
          }
        }
      }}
    ]
  }
}

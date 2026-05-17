import { cpus, totalmem, freemem, uptime, platform, hostname } from 'os'
import type { SystemInfoResult } from '../types'

/**
 * 系统信息采集服务
 * 收集 CPU、内存、磁盘等系统资源信息
 */
export class SystemInfoService {
  getCpuUsage(): number {
    const cpuList = cpus()
    let totalIdle = 0, totalTick = 0
    for (const cpu of cpuList) {
      for (const type in cpu.times) { totalTick += (cpu.times as Record<string, number>)[type] }
      totalIdle += cpu.times.idle
    }
    return Math.round((1 - totalIdle / totalTick) * 1000) / 10
  }

  async getDiskUsage(): Promise<{ used: number; total: number; percent: number }> {
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

  async collect(): Promise<SystemInfoResult> {
    const totalMem = totalmem(), freeMem = freemem(), usedMem = totalMem - freeMem
    const disk = await this.getDiskUsage()
    return {
      cpu: this.getCpuUsage(),
      memory: { used: usedMem, total: totalMem, percent: Math.round(usedMem / totalMem * 100) },
      disk,
      uptime: uptime(),
      platform: platform(),
      hostname: hostname()
    }
  }
}

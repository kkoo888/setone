/**
 * 资源采集器
 * 跨平台采集 CPU、内存、磁盘、GPU 使用率
 * 版块26 - 性能监控
 */
import * as os from 'os'
import * as fs from 'fs'
import * as child_process from 'child_process'
import type { SystemResourceSnapshot, ModuleResourceState } from '../types/performance'

/** CPU 使用率计算所需的快照数据 */
interface CpuSnapshot {
  idle: number
  total: number
}

/**
 * 资源采集器
 * 支持 Linux / macOS / Windows 跨平台资源采集
 */
export class ResourceCollector {
  /** 上一次 CPU 快照，用于计算差值 */
  private lastCpuSnapshot: CpuSnapshot | null = null
  /** 上一次磁盘 I/O 快照 */
  private lastDiskIOSnapshot: { readBytes: number; writeBytes: number; timestamp: number } | null = null
  /** 当前平台 */
  private readonly platform: NodeJS.Platform

  constructor() {
    this.platform = os.platform()
  }

  /**
   * 采集系统资源快照
   * @param moduleStates 当前各模块资源状态
   * @returns 系统资源快照
   */
  async collect(moduleStates: Record<string, ModuleResourceState> = {}): Promise<SystemResourceSnapshot> {
    const [cpu, memory, disk, diskIO, gpu] = await Promise.all([
      this.collectCpu(),
      this.collectMemory(),
      this.collectDisk(),
      this.collectDiskIO(),
      this.collectGpu(),
    ])

    return {
      timestamp: Date.now(),
      cpu,
      memory: memory.percent,
      memoryUsedMB: memory.usedMB,
      memoryTotalMB: memory.totalMB,
      disk,
      diskReadKBps: diskIO.readKBps,
      diskWriteKBps: diskIO.writeKBps,
      gpu: gpu.utilization,
      gpuMemory: gpu.memory,
      modules: Object.freeze({ ...moduleStates }),
    }
  }

  /**
   * 采集 CPU 使用率（基于 /proc/stat 差值或 os.cpus()）
   * @returns CPU 使用率百分比
   */
  private async collectCpu(): Promise<number> {
    if (this.platform === 'linux') {
      return this.collectCpuLinux()
    }
    return this.collectCpuFallback()
  }

  /**
   * Linux 平台：基于 /proc/stat 计算 CPU 使用率差值
   * 精度更高，不依赖采样间隔
   */
  private async collectCpuLinux(): Promise<number> {
    try {
      const content = await fs.promises.readFile('/proc/stat', 'utf-8')
      const line = content.split('\n')[0] // 第一行是 cpu 汇总
      if (!line) return this.collectCpuFallback()

      const parts = line.trim().split(/\s+/).slice(1).map(Number)
      // user, nice, system, idle, iowait, irq, softirq, steal
      const idle = parts[3] + (parts[4] ?? 0)
      const total = parts.reduce((a, b) => a + b, 0)

      if (this.lastCpuSnapshot) {
        const idleDiff = idle - this.lastCpuSnapshot.idle
        const totalDiff = total - this.lastCpuSnapshot.total
        this.lastCpuSnapshot = { idle, total }
        if (totalDiff === 0) return 0
        return Math.round(((totalDiff - idleDiff) / totalDiff) * 100 * 10) / 10
      }

      this.lastCpuSnapshot = { idle, total }
      return 0
    } catch {
      return this.collectCpuFallback()
    }
  }

  /**
   * 跨平台 CPU 采集降级方案
   * 使用 os.cpus() 计算平均使用率
   */
  private collectCpuFallback(): number {
    const cpus = os.cpus()
    let totalIdle = 0
    let totalTick = 0

    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
        totalTick += cpu.times[type]
      }
      totalIdle += cpu.times.idle
    }

    const idle = totalIdle / cpus.length
    const total = totalTick / cpus.length
    const usage = total > 0 ? ((total - idle) / total) * 100 : 0

    return Math.round(usage * 10) / 10
  }

  /**
   * 采集内存使用情况
   */
  private async collectMemory(): Promise<{ percent: number; usedMB: number; totalMB: number }> {
    const totalBytes = os.totalmem()
    const freeBytes = os.freemem()
    const usedBytes = totalBytes - freeBytes

    const totalMB = Math.round(totalBytes / (1024 * 1024))
    const usedMB = Math.round(usedBytes / (1024 * 1024))
    const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100 * 10) / 10 : 0

    return { percent, usedMB, totalMB }
  }

  /**
   * 采集磁盘使用率
   */
  private async collectDisk(): Promise<number> {
    try {
      if (this.platform === 'linux' || this.platform === 'darwin') {
        const output = await this.execCommand('df -h / | tail -1')
        const parts = output.trim().split(/\s+/)
        // 使用率在第 5 列（如 "45%"）
        const usageStr = parts[4]?.replace('%', '') ?? '0'
        return parseFloat(usageStr) || 0
      }

      if (this.platform === 'win32') {
        const output = await this.execCommand('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv')
        const lines = output.trim().split('\n').filter(Boolean)
        if (lines.length >= 2) {
          const data = lines[lines.length - 1]?.split(',')
          if (data && data.length >= 3) {
            const freeSpace = parseFloat(data[1] ?? '0')
            const totalSpace = parseFloat(data[2] ?? '1')
            return Math.round(((totalSpace - freeSpace) / totalSpace) * 100 * 10) / 10
          }
        }
      }
    } catch {
      // 降级：返回 0
    }
    return 0
  }

  /**
   * 采集磁盘 I/O 速率
   * 基于两次采样差值计算 KB/s
   */
  private async collectDiskIO(): Promise<{ readKBps: number; writeKBps: number }> {
    try {
      if (this.platform === 'linux') {
        const content = await fs.promises.readFile('/proc/diskstats', 'utf-8')
        // 汇总所有磁盘的读写字节数（简化处理）
        let totalRead = 0
        let totalWrite = 0
        for (const line of content.split('\n')) {
          const parts = line.trim().split(/\s+/)
          // 字段 5: 读取扇区数, 字段 9: 写入扇区数（每扇区 512 字节）
          if (parts.length >= 10) {
            totalRead += (parseInt(parts[5] ?? '0', 10) || 0) * 512
            totalWrite += (parseInt(parts[9] ?? '0', 10) || 0) * 512
          }
        }

        const now = Date.now()
        if (this.lastDiskIOSnapshot) {
          const elapsed = (now - this.lastDiskIOSnapshot.timestamp) / 1000
          if (elapsed > 0) {
            const readKBps = Math.round(((totalRead - this.lastDiskIOSnapshot.readBytes) / 1024) / elapsed)
            const writeKBps = Math.round(((totalWrite - this.lastDiskIOSnapshot.writeBytes) / 1024) / elapsed)
            this.lastDiskIOSnapshot = { readBytes: totalRead, writeBytes: totalWrite, timestamp: now }
            return { readKBps: Math.max(0, readKBps), writeKBps: Math.max(0, writeKBps) }
          }
        }
        this.lastDiskIOSnapshot = { readBytes: totalRead, writeBytes: totalWrite, timestamp: now }
      }
    } catch {
      // 降级处理
    }
    return { readKBps: 0, writeKBps: 0 }
  }

  /**
   * 采集 GPU 使用率
   * 支持 NVIDIA (nvidia-smi) / AMD (rocm-smi) / 降级方案
   */
  private async collectGpu(): Promise<{ utilization: number; memory: number }> {
    // 尝试 NVIDIA
    const nvidia = await this.collectNvidiaGpu()
    if (nvidia.utilization >= 0) return nvidia

    // 尝试 AMD
    const amd = await this.collectAmdGpu()
    if (amd.utilization >= 0) return amd

    // 降级：尝试 Linux sysfs
    if (this.platform === 'linux') {
      const sysfs = await this.collectGpuSysfs()
      if (sysfs.utilization >= 0) return sysfs
    }

    return { utilization: -1, memory: -1 }
  }

  /**
   * NVIDIA GPU 采集（nvidia-smi）
   */
  private async collectNvidiaGpu(): Promise<{ utilization: number; memory: number }> {
    try {
      const output = await this.execCommand(
        'nvidia-smi --query-gpu=utilization.gpu,utilization.memory --format=csv,noheader,nounits'
      )
      const parts = output.trim().split(',').map((s) => parseFloat(s.trim()))
      if (parts.length >= 2 && !isNaN(parts[0]!) && !isNaN(parts[1]!)) {
        return { utilization: parts[0]!, memory: parts[1]! }
      }
    } catch {
      // nvidia-smi 不可用
    }
    return { utilization: -1, memory: -1 }
  }

  /**
   * AMD GPU 采集（rocm-smi）
   */
  private async collectAmdGpu(): Promise<{ utilization: number; memory: number }> {
    try {
      const output = await this.execCommand('rocm-smi --use --memuse --csv')
      const lines = output.trim().split('\n')
      if (lines.length >= 2) {
        const data = lines[1]!.split(',')
        if (data.length >= 2) {
          const utilization = parseFloat(data[0]?.replace('%', '').trim() ?? '-1')
          const memory = parseFloat(data[1]?.replace('%', '').trim() ?? '-1')
          return { utilization: isNaN(utilization) ? -1 : utilization, memory: isNaN(memory) ? -1 : memory }
        }
      }
    } catch {
      // rocm-smi 不可用
    }
    return { utilization: -1, memory: -1 }
  }

  /**
   * Linux sysfs GPU 采集降级方案
   */
  private async collectGpuSysfs(): Promise<{ utilization: number; memory: number }> {
    try {
      // 尝试读取 DRM GPU busy 比例
      const drmDir = '/sys/class/drm'
      const entries = await fs.promises.readdir(drmDir)
      for (const entry of entries) {
        if (entry.startsWith('card') && !entry.includes('-')) {
          const busyPath = `${drmDir}/${entry}/device/gpu_busy_percentage`
          try {
            const content = await fs.promises.readFile(busyPath, 'utf-8')
            const value = parseFloat(content.trim().replace('%', ''))
            if (!isNaN(value)) {
              return { utilization: value, memory: -1 }
            }
          } catch {
            // 该 card 不支持 gpu_busy_percentage
          }
        }
      }
    } catch {
      // sysfs 不可用
    }
    return { utilization: -1, memory: -1 }
  }

  /**
   * 执行系统命令（带超时）
   */
  private execCommand(command: string, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = child_process.exec(command, { timeout: timeoutMs }, (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout)
        }
      })
      // 安全防护：确保进程不会挂起
      proc.on('error', reject)
    })
  }
}

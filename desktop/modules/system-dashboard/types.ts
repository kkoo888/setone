/** 系统信息结果 */
export interface SystemInfoResult {
  cpu: number
  memory: { used: number; total: number; percent: number }
  disk: { used: number; total: number; percent: number }
  uptime: number
  platform: string
  hostname: string
}

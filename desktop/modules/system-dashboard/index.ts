import type { Module, ModuleContext, Capability } from '../../src/main/types/module'
import { SystemInfoService } from './services/system-info-service'

export default class SystemDashboardModule implements Module {
  id = 'system-dashboard'
  meta!: import('../../src/main/types/module').ModuleMeta
  private context!: ModuleContext
  private infoService!: SystemInfoService

  async activate(context: ModuleContext): Promise<void> {
    this.context = context
    this.infoService = new SystemInfoService()
    context.logger.info('系统仪表盘模块已激活')
  }

  async deactivate(): Promise<void> {
    // 无定时器或事件监听需清理
    this.context.logger.info('系统仪表盘模块已停用')
  }

  getCapabilities(): Capability[] {
    return [
      {
        type: 'tool', name: 'system_info', description: '获取系统信息（CPU/内存/磁盘/运行时间）', priority: 10, moduleId: this.id,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: {
          execute: async () => {
            const data = await this.infoService.collect()
            return { success: true, data }
          }
        }
      }
    ]
  }
}

/**
 * IPC 处理器共享辅助函数
 * 模块状态映射、模块信息转换等通用工具
 */
import type { ModuleRegistration, ModuleInfo } from '../types/module'

/**
 * 将模块注册状态映射为前端模块状态
 * @param status - 模块注册状态
 * @returns 前端可用的模块状态字符串
 *
 * 前端期望: 'discovered' | 'loading' | 'active' | 'disabled' | 'error'
 * 后端 ModuleRegistrationStatus: 'discovered' | 'loading' | 'active' | 'error' | 'disabled' | 'incompatible'
 */
export function mapModuleStatus(status: ModuleRegistration['status']): string {
  const mapping: Record<ModuleRegistration['status'], string> = {
    discovered: 'discovered',
    loading: 'loading',
    active: 'active',
    error: 'error',
    disabled: 'disabled',
    incompatible: 'error'
  }
  return mapping[status]
}

/**
 * 将 ModuleRegistration 转换为前端 ModuleInfo 格式
 * @param reg - 模块注册信息
 * @returns 前端友好的模块信息
 */
export function toModuleInfo(reg: ModuleRegistration): ModuleInfo {
  return {
    id: reg.meta.id,
    name: reg.meta.name,
    description: reg.meta.description,
    version: reg.meta.version,
    author: reg.meta.author,
    status: mapModuleStatus(reg.status),
    enabled: reg.status === 'active',
    icon: '',
    dependencies: reg.meta.dependencies,
    hostVersion: reg.meta.hostVersion,
    priority: reg.meta.priority,
    resourceLimits: reg.meta.resourceLimits,
    provides: reg.meta.provides,
    consumes: reg.meta.consumes,
    settings: reg.meta.settings,
    lastUpdated: new Date().toISOString()
  }
}

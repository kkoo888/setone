import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { ModuleMeta } from '../types/module'
import type { Logger } from '../types/logger'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const REQUIRED_META_FIELDS: Array<{ key: keyof ModuleMeta; type: string }> = [
  { key: 'id', type: 'string' },
  { key: 'name', type: 'string' },
  { key: 'version', type: 'string' }
]

const MODULE_ID_REGEX = /^[a-z][a-z0-9-]*$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/
const REQUIRED_FILES = ['module.json']
const ENTRY_FILE_CANDIDATES = ['index.js', 'index.ts']

const VALID_CAPABILITY_TYPES = new Set([
  'tool', 'event', 'ui', 'service'
])

const CAPABILITY_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._-]*$/

export class ModuleValidator {
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  validateModule(modulePath: string): ValidationResult {
    const errors: string[] = []

    if (!existsSync(modulePath)) {
      return { valid: false, errors: [`模块目录不存在: ${modulePath}`] }
    }

    try {
      const stat = statSync(modulePath)
      if (!stat.isDirectory()) {
        errors.push(`路径不是目录: ${modulePath}`)
        return { valid: false, errors }
      }
    } catch (err) {
      errors.push(`无法读取目录信息: ${modulePath} (${(err as Error).message})`)
      return { valid: false, errors }
    }

    for (const file of REQUIRED_FILES) {
      const filePath = join(modulePath, file)
      if (!existsSync(filePath)) {
        errors.push(`缺少必需文件: ${file}`)
      } else {
        try {
          const stat = statSync(filePath)
          if (!stat.isFile()) {
            errors.push(`${file} 不是文件`)
          }
        } catch (err) {
          errors.push(`无法读取文件信息: ${file} (${(err as Error).message})`)
        }
      }
    }

    const hasEntry = ENTRY_FILE_CANDIDATES.some(f => existsSync(join(modulePath, f)))
    if (!hasEntry) {
      errors.push('缺少入口文件: 需要 index.js 或 index.ts')
    }

    const metaPath = join(modulePath, 'module.json')
    if (existsSync(metaPath)) {
      try {
        const raw = readFileSync(metaPath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          errors.push('module.json 根节点必须是对象')
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EACCES') {
          errors.push('module.json 无读取权限')
        } else {
          errors.push(`module.json 解析失败: ${(err as Error).message}`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  validateModuleJson(moduleJson: unknown): ValidationResult {
    const errors: string[] = []

    if (!moduleJson || typeof moduleJson !== 'object' || Array.isArray(moduleJson)) {
      return { valid: false, errors: ['module.json 必须是一个 JSON 对象'] }
    }

    const meta = moduleJson as Record<string, unknown>

    for (const { key, type } of REQUIRED_META_FIELDS) {
      const value = meta[key]
      if (value === undefined || value === null) {
        errors.push(`缺少必填字段: ${key}`)
      } else if (typeof value !== type) {
        errors.push(`字段 "${key}" 类型应为 ${type}，实际为 ${typeof value}`)
      }
    }

    if (typeof meta.id === 'string' && meta.id) {
      if (!MODULE_ID_REGEX.test(meta.id)) {
        errors.push(`模块 ID "${meta.id}" 格式不合法，仅允许小写字母、数字和连字符，且以字母开头`)
      }
      if (meta.id.length > 64) {
        errors.push('模块 ID 长度不能超过 64 字符')
      }
    }

    if (typeof meta.version === 'string' && meta.version) {
      if (!SEMVER_REGEX.test(meta.version)) {
        errors.push(`版本号 "${meta.version}" 不符合 Semver 规范 (x.y.z)`)
      }
    }

    if (typeof meta.name === 'string' && meta.name) {
      if (meta.name.length > 128) {
        errors.push('模块名称长度不能超过 128 字符')
      }
    }

    if (meta.description !== undefined && typeof meta.description !== 'string') {
      errors.push('description 字段应为字符串')
    }

    if (meta.dependencies !== undefined) {
      if (!Array.isArray(meta.dependencies)) {
        errors.push('dependencies 字段应为字符串数组')
      } else {
        for (let i = 0; i < meta.dependencies.length; i++) {
          const dep = meta.dependencies[i]
          if (typeof dep !== 'string' || !dep.trim()) {
            errors.push(`dependencies[${i}] 不是有效的非空字符串`)
          }
        }
        const uniqueDeps = new Set(meta.dependencies)
        if (uniqueDeps.size !== meta.dependencies.length) {
          errors.push('dependencies 中存在重复项')
        }
      }
    }

    if (meta.provides !== undefined) {
      const capResult = this.validateCapabilities(meta.provides)
      if (!capResult.valid) {
        errors.push(...capResult.errors)
      }
    }

    if (meta.priority !== undefined) {
      if (typeof meta.priority !== 'number' || !Number.isInteger(meta.priority)) {
        errors.push('priority 字段应为整数')
      } else if (meta.priority < 0 || meta.priority > 1000) {
        errors.push(`priority 值 "${meta.priority}" 不在有效范围 0-1000 内`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  validateDependencies(
    deps: string[],
    registeredModules: Set<string>
  ): ValidationResult {
    const errors: string[] = []

    if (!Array.isArray(deps)) {
      return { valid: false, errors: ['依赖列表必须是字符串数组'] }
    }

    for (const dep of deps) {
      if (typeof dep !== 'string' || !dep.trim()) {
        errors.push('存在无效的依赖声明（非字符串或为空）')
        continue
      }
      if (!registeredModules.has(dep)) {
        errors.push(`依赖模块 "${dep}" 未在已注册模块中找到`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  validateCapabilities(capabilities: unknown): ValidationResult {
    const errors: string[] = []

    if (!Array.isArray(capabilities)) {
      return { valid: false, errors: ['能力声明 (provides) 必须是数组'] }
    }

    if (capabilities.length === 0) {
      return { valid: true, errors: [] }
    }

    const declaredNames = new Set<string>()

    for (let i = 0; i < capabilities.length; i++) {
      const cap = capabilities[i]
      const prefix = `provides[${i}]`

      if (!cap || typeof cap !== 'object' || Array.isArray(cap)) {
        errors.push(`${prefix} 必须是对象`)
        continue
      }

      const capObj = cap as Record<string, unknown>

      if (!capObj.name || typeof capObj.name !== 'string') {
        errors.push(`${prefix} 缺少必填字段 "name"（字符串）`)
      } else {
        if (!CAPABILITY_NAME_REGEX.test(capObj.name)) {
          errors.push(`${prefix}.name "${capObj.name}" 格式不合法`)
        }
        if (declaredNames.has(capObj.name)) {
          errors.push(`${prefix}.name "${capObj.name}" 重复声明`)
        }
        declaredNames.add(capObj.name)
      }

      if (!capObj.type || typeof capObj.type !== 'string') {
        errors.push(`${prefix} 缺少必填字段 "type"（字符串）`)
      } else if (!VALID_CAPABILITY_TYPES.has(capObj.type)) {
        errors.push(`${prefix}.type "${capObj.type}" 不是合法的能力类型，可选值: ${[...VALID_CAPABILITY_TYPES].join(', ')}`)
      }

      if (capObj.description !== undefined && typeof capObj.description !== 'string') {
        errors.push(`${prefix}.description 应为字符串`)
      }

      if (capObj.options !== undefined) {
        if (typeof capObj.options !== 'object' || capObj.options === null || Array.isArray(capObj.options)) {
          errors.push(`${prefix}.options 应为对象`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  validate(modulePath: string, registeredModules?: Set<string>): ValidationResult {
    const allErrors: string[] = []

    const dirResult = this.validateModule(modulePath)
    if (!dirResult.valid) {
      return { valid: false, errors: dirResult.errors }
    }

    let meta: Record<string, unknown>
    try {
      const raw = readFileSync(join(modulePath, 'module.json'), 'utf-8')
      meta = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      return { valid: false, errors: [`module.json 读取或解析失败: ${(err as Error).message}`] }
    }

    const jsonResult = this.validateModuleJson(meta)
    if (!jsonResult.valid) {
      allErrors.push(...jsonResult.errors)
    }

    if (jsonResult.valid && registeredModules && Array.isArray(meta.dependencies)) {
      const depResult = this.validateDependencies(
        meta.dependencies as string[],
        registeredModules
      )
      if (!depResult.valid) {
        allErrors.push(...depResult.errors)
      }
    }

    if (meta.provides !== undefined) {
      const capResult = this.validateCapabilities(meta.provides)
      if (!capResult.valid) {
        allErrors.push(...capResult.errors)
      }
    }

    this.logger.debug(`[ModuleValidator] 模块 "${(meta as ModuleMeta).id}" 校验完成`, {
      valid: allErrors.length === 0,
      errorCount: allErrors.length
    })

    return { valid: allErrors.length === 0, errors: allErrors }
  }
}

/**
 * 模块编译脚本（轻量版）
 * 使用 esbuild 将 TypeScript 转译为 JavaScript（不打包依赖，节省磁盘）
 * 输出到 modules-dist/<module-id>/index.js + module.json
 *
 * 用法: node scripts/build-modules.mjs
 */
import { readdirSync, existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve, dirname, extname } from 'path'
import { execSync } from 'child_process'

const ROOT = resolve(import.meta.dirname, '..')
const MODULES_DIR = join(ROOT, 'modules')
const OUT_DIR = join(ROOT, 'modules-dist')

/** 需要排除的目录 */
const SKIP_DIRS = ['node_modules', 'dist', 'dist-packaged', '.git']

/**
 * 递归获取目录下所有 .ts 文件（排除 .d.ts 和测试文件）
 */
function getAllTsFiles(dir) {
  const files = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name)) {
      files.push(...getAllTsFiles(fullPath))
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('.test.')
    ) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * 后处理：给 ESM 相对 import/export 的裸路径补 .js 扩展名
 * Node.js ESM 要求 import './foo' 写成 import './foo.js'
 */
function fixEsmImportExtensions(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      fixEsmImportExtensions(fullPath)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      let code = readFileSync(fullPath, 'utf-8')
      // 匹配 from './xxx' 或 from "../xxx" 中没有扩展名的路径
      const fixed = code.replace(
        /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
        (m, prefix, path, suffix) => {
          if (extname(path)) return m // 已有扩展名，跳过
          return `${prefix}${path}.js${suffix}`
        }
      )
      if (fixed !== code) {
        writeFileSync(fullPath, fixed, 'utf-8')
      }
    }
  }
}

/**
 * 编译单个模块（使用 esbuild 转译，不打包依赖）
 * @param {string} moduleId - 模块目录名
 * @returns {boolean} 是否成功
 */
function buildModule(moduleId) {
  const moduleDir = join(MODULES_DIR, moduleId)
  const entryFile = join(moduleDir, 'index.ts')
  const outDir = join(OUT_DIR, moduleId)

  if (!existsSync(entryFile)) {
    console.warn(`  ⚠️  跳过 ${moduleId}：缺少 index.ts`)
    return false
  }

  // 清理输出目录
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true })
  }
  mkdirSync(outDir, { recursive: true })

  try {
    // 获取模块内所有 TS 源文件
    const tsFiles = getAllTsFiles(moduleDir)

    // 使用 esbuild 逐个转译（保留目录结构）
    for (const tsFile of tsFiles) {
      const relativePath = tsFile.replace(moduleDir + '/', '').replace(moduleDir + '\\', '')
      const outFilePath = join(outDir, relativePath.replace(/\.ts$/, '.js'))
      const outFileDir = dirname(outFilePath)

      if (!existsSync(outFileDir)) {
        mkdirSync(outFileDir, { recursive: true })
      }

      execSync(
        `npx esbuild "${tsFile}" --outfile="${outFilePath}" --format=esm --target=es2022 --platform=node --bundle=false`,
        { cwd: ROOT, stdio: 'pipe', timeout: 10000 }
      )
    }

    // 复制 module.json 到输出目录
    const moduleJsonSrc = join(moduleDir, 'module.json')
    const moduleJsonDst = join(outDir, 'module.json')
    if (existsSync(moduleJsonSrc)) {
      cpSync(moduleJsonSrc, moduleJsonDst)
    }

    // 后处理：给 ESM 相对 import 补 .js 扩展名
    fixEsmImportExtensions(outDir)

    return true
  } catch (err) {
    console.error(`  ❌ ${moduleId} 编译失败:`, err.message)
    return false
  }
}

/** 主流程 */
function main() {
  console.log('🔧 开始编译模块（esbuild 轻量模式）...\n')

  if (!existsSync(MODULES_DIR)) {
    console.error('❌ 模块目录不存在:', MODULES_DIR)
    process.exit(1)
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true })
  }

  const entries = readdirSync(MODULES_DIR, { withFileTypes: true })
  const modules = entries.filter(e => e.isDirectory() && !SKIP_DIRS.includes(e.name))

  let success = 0
  let failed = 0

  for (const mod of modules) {
    process.stdout.write(`  📦 ${mod.name}... `)
    if (buildModule(mod.name)) {
      console.log('✅')
      success++
    } else {
      failed++
    }
  }

  console.log(`\n✨ 完成！成功 ${success} 个，失败 ${failed} 个`)

  if (failed > 0) {
    process.exit(1)
  }
}

main()

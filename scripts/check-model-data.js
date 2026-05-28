#!/usr/bin/env node
/**
 * Live2D5 模型加载诊断脚本
 * 检查表情/动作数据是否能正确加载
 */

const fs = require('fs')
const path = require('path')

const MODEL_DIR = path.join(__dirname, '..', 'desktop/src/renderer/public/live2d/yumi')
const MODEL_JSON = path.join(MODEL_DIR, 'yumi.model3.json')

console.log('🔍 Live2D5 模型加载诊断\n')

// 1. 检查 model3.json 是否存在
console.log('=== 1. 检查 model3.json ===')
if (!fs.existsSync(MODEL_JSON)) {
  console.error('❌ model3.json 不存在:', MODEL_JSON)
  process.exit(1)
}
console.log('✅ model3.json 存在')

// 2. 解析 JSON
console.log('\n=== 2. 解析 model3.json ===')
const json = JSON.parse(fs.readFileSync(MODEL_JSON, 'utf-8'))
const fileRefs = json.FileReferences ?? {}

const expressions = fileRefs.Expressions ?? []
const motions = fileRefs.Motions ?? {}
console.log(`📋 Expressions 数组: ${expressions.length} 个`)
console.log(`📋 Motions 对象: ${Object.keys(motions).length} 个组`)

// 3. 检查 CubismModelSettingJson 解析路径
// 模拟: this.getJson().getRoot().getValueByString('FileReferences').getValueByString('Expressions')
console.log('\n=== 3. 模拟 CubismModelSettingJson 解析 ===')
const fileReferences = json['FileReferences']
if (!fileReferences) {
  console.error('❌ FileReferences 节点不存在')
} else {
  console.log('✅ FileReferences 存在')

  const expressionsNode = fileReferences['Expressions']
  if (!expressionsNode) {
    console.error('❌ FileReferences.Expressions 不存在')
  } else if (!Array.isArray(expressionsNode)) {
    console.error('❌ FileReferences.Expressions 不是数组, 类型:', typeof expressionsNode)
  } else {
    console.log(`✅ FileReferences.Expressions 是数组, 长度: ${expressionsNode.length}`)
    console.log('   getExpressionCount() 应返回:', expressionsNode.length)

    // 检查每个表情的 Name 和 File
    for (const [i, expr] of expressionsNode.entries()) {
      const name = expr['Name']
      const file = expr['File']
      if (!name) console.warn(`   ⚠️ 表情 [${i}] 缺少 Name 字段`)
      if (!file) console.warn(`   ⚠️ 表情 [${i}] 缺少 File 字段`)
    }
  }

  const motionsNode = fileReferences['Motions']
  if (!motionsNode) {
    console.error('❌ FileReferences.Motions 不存在')
  } else if (typeof motionsNode !== 'object') {
    console.error('❌ FileReferences.Motions 不是对象, 类型:', typeof motionsNode)
  } else {
    const groups = Object.keys(motionsNode)
    console.log(`✅ FileReferences.Motions 是对象, 组数: ${groups.length}`)
    console.log('   getMotionGroupCount() 应返回:', groups.length)
    for (const group of groups) {
      const count = Array.isArray(motionsNode[group]) ? motionsNode[group].length : 0
      console.log(`   ${group}: ${count} 个动作`)
    }
  }
}

// 4. 检查表情文件是否可读
console.log('\n=== 4. 检查表情文件可读性 ===')
let exprOk = 0, exprFail = 0
for (const expr of expressions) {
  const filePath = path.join(MODEL_DIR, expr.File)
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath)
    console.log(`  ✅ ${expr.Name} → ${expr.File} (${stat.size} bytes)`)
    exprOk++
  } else {
    console.error(`  ❌ ${expr.Name} → ${expr.File} 文件不存在!`)
    exprFail++
  }
}
console.log(`\n  表情: ${exprOk} 可读, ${exprFail} 不可读`)

// 5. 检查动作文件是否可读
console.log('\n=== 5. 检查动作文件可读性 ===')
let motionOk = 0, motionFail = 0
for (const [group, files] of Object.entries(motions)) {
  for (const [i, motion] of files.entries()) {
    const filePath = path.join(MODEL_DIR, motion.File)
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath)
      console.log(`  ✅ ${group}[${i}] → ${motion.File} (${stat.size} bytes)`)
      motionOk++
    } else {
      console.error(`  ❌ ${group}[${i}] → ${motion.File} 文件不存在!`)
      motionFail++
    }
  }
}
console.log(`\n  动作: ${motionOk} 可读, ${motionFail} 不可读`)

// 6. 检查 file:// URL 构造（修复后的方式）
console.log('\n=== 6. 检查 file:// URL 构造 ===')
const absPath = MODEL_DIR
const normalized = absPath.replace(/\\/g, '/')
const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
console.log('  原始路径:', absPath)
console.log('  file:// URL:', fileUrl)

// 模拟 fetch URL（表情文件）
const sampleExpr = expressions[0]
if (sampleExpr) {
  const modelDir = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1)
  const fetchUrl = modelDir + sampleExpr.File
  console.log('\n  模拟 fetch 表情 URL:')
  console.log('  modelDir:', modelDir)
  console.log('  fetch URL:', fetchUrl)
  console.log('  中文是否被编码:', fetchUrl.includes('%') ? '⚠️ 是(可能有问题)' : '✅ 否(正确)')
}

// 7. 对比 pathToFileURL 的结果
console.log('\n=== 7. 对比 pathToFileURL ===')
try {
  const { pathToFileURL } = require('url')
  const encoded = pathToFileURL(absPath).href
  console.log('  pathToFileURL:', encoded)
  console.log('  手动构造:    ', fileUrl)
  console.log('  是否相同:', encoded === fileUrl ? '相同' : '⚠️ 不同!')
  if (encoded !== fileUrl) {
    console.log('  差异: pathToFileURL 对中文做了 percent-encode')
    const sampleExprUrl = encoded.substring(0, encoded.lastIndexOf('/') + 1) + sampleExpr.File
    console.log('  pathToFileURL fetch URL:', sampleExprUrl)
    console.log('  → Chromium fetch 无法解析此 URL (中文被编码)')
  }
} catch {
  console.log('  url 模块不可用')
}

// 8. 总结
console.log('\n=== 📊 诊断总结 ===')
console.log(`  表情总数: ${expressions.length}`)
console.log(`  动作组数: ${Object.keys(motions).length}`)
console.log(`  动作总数: ${Object.values(motions).reduce((s, a) => s + a.length, 0)}`)
console.log(`  文件检查: ${exprOk + motionOk} 可读, ${exprFail + motionFail} 不可读`)

if (expressions.length > 0 && exprOk === expressions.length) {
  console.log('\n  ✅ model3.json 数据完整，所有文件可读')
  console.log('  💡 如果页面仍显示 0，请检查:')
  console.log('     1. 宠物窗口是否重新打开（修复后需要重启）')
  console.log('     2. 浏览器 Console 是否有 fetch 失败的错误')
  console.log('     3. model 路径是否包含 percent-encoded 中文')
}

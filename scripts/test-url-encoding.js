#!/usr/bin/env node
/**
 * 验证 buildFileUrl 对中英文路径的兼容性
 * 核心：modelDir 已被 pathToFileURL 编码，只对 filename 做 encodeURI
 */

const { fileURLToPath, pathToFileURL } = require('url')

console.log('='.repeat(60))
console.log('中英文路径编码兼容性测试 (修复版)')
console.log('='.repeat(60))

// 模拟主进程 pathToFileURL 编码
function encodeModelDir(absPath) {
  return pathToFileURL(absPath).href
}

// 模拟 renderer 的 buildFileUrl（修复后）
function buildFileUrl(modelDir, filename) {
  return modelDir + encodeURI(filename)
}

let allPassed = true

function test(label, modelDirAbs, files) {
  console.log(`\n📦 ${label}`)
  const modelDir = encodeModelDir(modelDirAbs)
  console.log(`   modelDir: ${modelDir}`)

  for (const file of files) {
    const url = buildFileUrl(modelDir, file)

    // 模拟 protocol handler 的 fileURLToPath 解码
    let decodedPath
    try {
      decodedPath = fileURLToPath(url)
    } catch {
      decodedPath = decodeURIComponent(url.replace('file://', ''))
    }

    // 期望路径 = 绝对路径 + 原始文件名
    const expectedSuffix = file
    const gotSuffix = decodedPath.replace(modelDirAbs.replace(/\\/g, '/'), '')

    // fileURLToPath 会把整个路径解码回中文
    const expectedFull = modelDirAbs.replace(/\\/g, '/') + file
    const pathMatch = decodedPath === expectedFull

    const status = pathMatch ? '✅' : '❌'
    if (!pathMatch) allPassed = false

    console.log(`   ${status} ${file}`)
    if (!pathMatch) {
      console.log(`      期望: ${expectedFull}`)
      console.log(`      实际: ${decodedPath}`)
    }
    console.log(`      URL:  ${url}`)
  }
}

// 测试用例
test('yumi (中文表情)', '/app/live2d/yumi/', [
  'yumi.moc3',
  '舌头伸出.exp3.json',
  '星星眼.exp3.json',
  'wave.motion3.json',
  'motions/bboomboom.motion3.json',
])

test('Ren (纯英文)', '/app/live2d/Ren/', [
  'Ren.moc3',
  'texture_00.png',
  'happy.exp3.json',
  'idle.motion3.json',
])

test('混合 (英文模型+中文子目录)', '/app/live2d/模型test/', [
  'model.moc3',
  '表情/开心.exp3.json',
  '动作/idle.motion3.json',
])

// 防重复编码验证
console.log('\n🔧 防重复编码验证:')
const encodedDir = pathToFileURL('/app/live2d/yumi/').href
console.log(`   modelDir (已编码): ${encodedDir}`)

const file1 = '舌头伸出.exp3.json'
const url1 = buildFileUrl(encodedDir, file1)
console.log(`   buildFileUrl: ${url1}`)

// 检查是否出现 %25（重复编码的标志）
const hasDoubleEncode = url1.includes('%25')
console.log(`   含 %25 (重复编码): ${hasDoubleEncode ? '❌ 是!' : '✅ 否'}`)
if (hasDoubleEncode) allPassed = false

// 验证解码回来是否正确
const decoded = fileURLToPath(url1)
const expected = '/app/live2d/yumi/舌头伸出.exp3.json'
console.log(`   解码结果: ${decoded}`)
console.log(`   期望结果: ${expected}`)
console.log(`   匹配: ${decoded === expected ? '✅' : '❌'}`)
if (decoded !== expected) allPassed = false

// 纯英文路径不受影响
const file2 = 'wave.motion3.json'
const url2 = buildFileUrl(encodedDir, file2)
console.log(`\n   英文文件: ${url2}`)
console.log(`   无变化: ${url2 === encodedDir + file2 ? '✅' : '❌'}`)

console.log('\n' + '='.repeat(60))
console.log(allPassed ? '✅ 全部通过!' : '❌ 有失败项!')
console.log('='.repeat(60))

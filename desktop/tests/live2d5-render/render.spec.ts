/**
 * Live2D Cubism 5 渲染测试
 */
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:39201'
const PUBLIC_DIR = join(import.meta.dirname, '../../src/renderer/public')

test('Cubism5 Ren 模型完整渲染流程', async ({ page }) => {
  // 拦截 shader 文件
  await page.route('**/Framework/Shaders/WebGL2/**', (route, request) => {
    const fileName = request.url().split('/').pop()
    const filePath = join(PUBLIC_DIR, 'Framework/Shaders/WebGL2', fileName)
    if (existsSync(filePath)) {
      route.fulfill({ status: 200, contentType: 'text/plain', body: readFileSync(filePath, 'utf-8') })
    } else {
      route.continue()
    }
  })

  const logs: string[] = []
  page.on('console', msg => logs.push(msg.text()))
  page.on('pageerror', err => logs.push(`[PAGEERROR] ${err.message}`))

  await page.goto(BASE, { waitUntil: 'load', timeout: 15_000 })

  // 等待 __testResult
  const result = await page.waitForFunction(
    () => (window as any).__testResult !== undefined,
    { timeout: 30_000 }
  ).then(() => page.evaluate(() => (window as any).__testResult))

  console.log('=== 测试日志 ===')
  logs.forEach(l => console.log('  ', l))
  console.log('\n=== 结果 ===')
  console.log(JSON.stringify(result, null, 2))

  expect(result.ok).toBe(true)
  expect(result.centerAlpha).toBeGreaterThan(0)
})

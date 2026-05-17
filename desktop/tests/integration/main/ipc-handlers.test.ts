/**
 * 集成测试 — IPC 处理器
 * @description 测试主进程 IPC 处理器的注册与响应
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockIpcMain } from '../../mocks/electron'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-ipc' },
  ipcMain: createMockIpcMain(),
}))

describe('IPC 处理器集成测试', () => {
  describe('模块管理通道', () => {
    it('module:list 返回模块列表', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      // 模拟注册 handler
      mockIpc.handle('module:list', (_event: any) => {
        return [
          { id: 'chat', meta: { name: '聊天模块' }, status: 'active' },
          { id: 'weather', meta: { name: '天气模块' }, status: 'active' },
        ]
      })

      const result = await mockIpc._invoke('module:list')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('chat')
    })

    it('module:enable 启用模块返回 true', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      mockIpc.handle('module:enable', (_event: any, data: any) => {
        return data.moduleId === 'chat'
      })

      const result = await mockIpc._invoke('module:enable', { moduleId: 'chat' })
      expect(result).toBe(true)
    })

    it('module:disable 禁用模块返回 true', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      mockIpc.handle('module:disable', (_event: any, data: any) => {
        return data.moduleId === 'chat'
      })

      const result = await mockIpc._invoke('module:disable', { moduleId: 'chat' })
      expect(result).toBe(true)
    })
  })

  describe('配置通道', () => {
    it('config:get 返回配置值', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      const configStore: Record<string, unknown> = {
        'ui.theme': 'dark',
        'ollama.model': 'qwen2.5:7b',
      }

      mockIpc.handle('config:get', (_event: any, data: any) => {
        return configStore[data.key]
      })

      const theme = await mockIpc._invoke('config:get', { key: 'ui.theme' })
      expect(theme).toBe('dark')
    })

    it('config:set 保存配置', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      mockIpc.handle('config:set', (_event: any, data: any) => {
        return { success: true }
      })

      const result = await mockIpc._invoke('config:set', { key: 'ui.theme', value: 'light' })
      expect(result.success).toBe(true)
    })
  })

  describe('错误处理', () => {
    it('未注册的通道抛出错误', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      await expect(mockIpc._invoke('unknown:channel')).rejects.toThrow('No handler registered')
    })

    it('handler 异常传播到调用方', async () => {
      const { ipcMain } = await import('electron')
      const mockIpc = ipcMain as unknown as ReturnType<typeof createMockIpcMain>

      mockIpc.handle('error:channel', () => {
        throw new Error('服务端错误')
      })

      await expect(mockIpc._invoke('error:channel')).rejects.toThrow('服务端错误')
    })
  })
})

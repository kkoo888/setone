/**
 * EncryptionService 单元测试
 * @description 测试 AES-256-GCM 加密/解密、密钥管理、密钥轮换
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron — 必须在 import 之前
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-encrypt' },
}))

describe('EncryptionService', () => {
  let service: InstanceType<typeof import('../../../../src/main/core/security/EncryptionService').EncryptionService>

  beforeEach(async () => {
    const { EncryptionService } = await import('../../../../src/main/core/security/EncryptionService')
    service = new EncryptionService()
  })

  afterEach(() => {
    service.destroy()
  })

  // ── 初始化 ───────────────────────────────────────────────

  describe('initialize', () => {
    it('使用密码初始化成功', () => {
      service.initialize('test-password-123')
      expect(service.isInitialized()).toBe(true)
    })

    it('使用密码和盐初始化', () => {
      const { randomBytes } = require('crypto')
      const salt = randomBytes(32)
      service.initialize('test-password', salt)
      expect(service.isInitialized()).toBe(true)
      expect(service.getSalt()).toEqual(salt)
    })

    it('密码为空时抛出异常', () => {
      expect(() => service.initialize('')).toThrow('密码不能为空')
    })

    it('未初始化时调用 getSalt 抛出异常', () => {
      expect(() => service.getSalt()).toThrow('EncryptionService 未初始化')
    })
  })

  // ── 加密/解密 ────────────────────────────────────────────

  describe('encrypt / decrypt', () => {
    beforeEach(() => {
      service.initialize('test-password-123')
    })

    it('加密字符串并成功解密', () => {
      const plaintext = '你好世界，这是测试数据！'
      const ciphertext = service.encrypt(plaintext)
      const decrypted = service.decrypt(ciphertext)
      expect(decrypted.toString('utf8')).toBe(plaintext)
    })

    it('加密 Buffer 并成功解密', () => {
      const data = Buffer.from([0x01, 0x02, 0x03, 0xff])
      const ciphertext = service.encrypt(data)
      const decrypted = service.decrypt(ciphertext)
      expect(decrypted).toEqual(data)
    })

    it('密文格式：[IV 16B][AuthTag 16B][Ciphertext]', () => {
      const plaintext = 'test'
      const ciphertext = service.encrypt(plaintext)
      // 最小长度：16 (IV) + 16 (AuthTag) + 1 (至少1字节密文)
      expect(ciphertext.length).toBeGreaterThanOrEqual(33)
    })

    it('每次加密产生不同的密文（随机 IV）', () => {
      const plaintext = 'same data'
      const c1 = service.encrypt(plaintext)
      const c2 = service.encrypt(plaintext)
      // 同明文不同密文（因为 IV 不同）
      expect(c1.equals(c2)).toBe(false)
    })

    it('密文长度不足时解密抛出异常', () => {
      const tooShort = Buffer.alloc(10)
      expect(() => service.decrypt(tooShort)).toThrow('密文长度不足')
    })

    it('篡改密文后解密失败（Auth Tag 校验）', () => {
      const ciphertext = service.encrypt('tamper test')
      // 篡改最后一字节
      ciphertext[ciphertext.length - 1] ^= 0xff
      expect(() => service.decrypt(ciphertext)).toThrow()
    })

    it('未初始化时加密抛出异常', () => {
      const { EncryptionService } = require('../../../../src/main/core/security/EncryptionService')
      const fresh = new EncryptionService()
      expect(() => fresh.encrypt('test')).toThrow('EncryptionService 未初始化')
    })

    it('未初始化时解密抛出异常', () => {
      const { EncryptionService } = require('../../../../src/main/core/security/EncryptionService')
      const fresh = new EncryptionService()
      expect(() => fresh.decrypt(Buffer.alloc(33))).toThrow('EncryptionService 未初始化')
    })
  })

  // ── 密钥轮换 ─────────────────────────────────────────────

  describe('rotateKey', () => {
    it('用新密码重新加密后能用新密钥解密', () => {
      service.initialize('old-password')
      const plaintext = '需要轮换的数据'
      const ciphertext = service.encrypt(plaintext)

      const { data: newCiphertext, salt: newSalt } = service.rotateKey(
        'old-password',
        'new-password',
        ciphertext
      )

      // 用新密钥解密
      const decrypted = service.decrypt(newCiphertext)
      expect(decrypted.toString('utf8')).toBe(plaintext)
    })

    it('轮换后发出 encryption:rotated 事件', () => {
      service.initialize('old-pw')
      const ciphertext = service.encrypt('data')
      const handler = vi.fn()
      service.on('encryption:rotated', handler)
      service.rotateKey('old-pw', 'new-pw', ciphertext)
      expect(handler).toHaveBeenCalled()
    })

    it('轮换后旧密码无法解密新密文', () => {
      service.initialize('old-pw')
      const ciphertext = service.encrypt('data')
      const { data: newCiphertext } = service.rotateKey('old-pw', 'new-pw', ciphertext)

      // 创建新实例用旧密码
      const { EncryptionService } = require('../../../../src/main/core/security/EncryptionService')
      const oldService = new EncryptionService()
      oldService.initialize('old-pw')
      expect(() => oldService.decrypt(newCiphertext)).toThrow()
      oldService.destroy()
    })
  })

  // ── 校验和 ───────────────────────────────────────────────

  describe('computeChecksum', () => {
    it('计算字符串的 SHA-256 校验和', () => {
      service.initialize('pw')
      const checksum = service.computeChecksum('hello')
      expect(checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('计算 Buffer 的 SHA-256 校验和', () => {
      service.initialize('pw')
      const checksum = service.computeChecksum(Buffer.from('hello'))
      expect(checksum).toMatch(/^[a-f0-9]{64}$/)
    })

    it('相同输入产生相同校验和', () => {
      service.initialize('pw')
      const a = service.computeChecksum('test')
      const b = service.computeChecksum('test')
      expect(a).toBe(b)
    })

    it('不同输入产生不同校验和', () => {
      service.initialize('pw')
      const a = service.computeChecksum('hello')
      const b = service.computeChecksum('world')
      expect(a).not.toBe(b)
    })
  })

  // ── destroy ──────────────────────────────────────────────

  describe('destroy', () => {
    it('销毁后 isInitialized 返回 false', () => {
      service.initialize('pw')
      service.destroy()
      expect(service.isInitialized()).toBe(false)
    })

    it('销毁后加密抛出异常', () => {
      service.initialize('pw')
      service.destroy()
      expect(() => service.encrypt('test')).toThrow('EncryptionService 未初始化')
    })

    it('销毁后移除所有事件监听', () => {
      service.initialize('pw')
      const handler = vi.fn()
      service.on('encryption:rotated', handler)
      service.destroy()
      // 事件监听器应被清除
      expect(service.listenerCount('encryption:rotated')).toBe(0)
    })
  })
})

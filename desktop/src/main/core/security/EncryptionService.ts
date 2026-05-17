/**
 * 加密服务 — AES-256-GCM 加密/解密 + 密钥管理
 *
 * 密文格式：[IV 16B][AuthTag 16B][Ciphertext]
 */
import { EventEmitter } from 'events'
import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'crypto'
import { SECURITY_CONSTANTS } from './constants'
import type { SecurityEvents } from './types'

const { ENCRYPTION } = SECURITY_CONSTANTS

export class EncryptionService extends EventEmitter {
  private key: Buffer | null = null
  private salt: Buffer | null = null
  private initialized = false

  /**
   * 初始化加密服务：PBKDF2 密钥派生
   * @param password 用户密码
   * @param salt 可选盐值，不传则自动生成
   */
  initialize(password: string, salt?: Buffer): void {
    if (!password) {
      throw new Error('密码不能为空')
    }

    this.salt = salt ?? randomBytes(ENCRYPTION.saltLength)
    this.key = pbkdf2Sync(
      password,
      this.salt,
      ENCRYPTION.iterations,
      ENCRYPTION.keyLength,
      'sha512'
    )
    this.initialized = true
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this.initialized
  }

  /** 获取当前盐值（用于持久化） */
  getSalt(): Buffer {
    this.assertInitialized()
    return this.salt!
  }

  /**
   * AES-256-GCM 加密
   * 输出格式：[IV 16B][AuthTag 16B][Ciphertext]
   * @param plaintext 明文
   * @returns 密文 Buffer
   */
  encrypt(plaintext: string | Buffer): Buffer {
    this.assertInitialized()

    const iv = randomBytes(ENCRYPTION.ivLength)
    const cipher = createCipheriv(
      ENCRYPTION.algorithm,
      this.key!,
      iv,
      { authTagLength: ENCRYPTION.authTagLength }
    )

    const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()])
    const authTag = cipher.getAuthTag()

    // 拼接：[IV][AuthTag][Ciphertext]
    return Buffer.concat([iv, authTag, encrypted])
  }

  /**
   * AES-256-GCM 解密
   * @param ciphertext 密文 Buffer（格式：[IV 16B][AuthTag 16B][Ciphertext]）
   * @returns 明文 Buffer
   */
  decrypt(ciphertext: Buffer): Buffer {
    this.assertInitialized()

    const ivLen = ENCRYPTION.ivLength
    const tagLen = ENCRYPTION.authTagLength

    if (ciphertext.length < ivLen + tagLen) {
      throw new Error('密文长度不足，无法解密')
    }

    const iv = ciphertext.subarray(0, ivLen)
    const authTag = ciphertext.subarray(ivLen, ivLen + tagLen)
    const data = ciphertext.subarray(ivLen + tagLen)

    const decipher = createDecipheriv(
      ENCRYPTION.algorithm,
      this.key!,
      iv,
      { authTagLength: tagLen }
    )
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(data), decipher.final()])
  }

  /**
   * 密钥轮换：用旧密码解密 → 用新密码重新加密
   * @param oldPassword 旧密码
   * @param newPassword 新密码
   * @param encryptedData 旧密文
   * @returns 新密文 + 新盐
   */
  rotateKey(
    oldPassword: string,
    newPassword: string,
    encryptedData: Buffer
  ): { data: Buffer; salt: Buffer } {
    // 用旧密钥解密
    const oldSalt = this.salt!
    const oldKey = pbkdf2Sync(
      oldPassword,
      oldSalt,
      ENCRYPTION.iterations,
      ENCRYPTION.keyLength,
      'sha512'
    )

    // 临时解密
    const ivLen = ENCRYPTION.ivLength
    const tagLen = ENCRYPTION.authTagLength
    const iv = encryptedData.subarray(0, ivLen)
    const authTag = encryptedData.subarray(ivLen, ivLen + tagLen)
    const data = encryptedData.subarray(ivLen + tagLen)

    const decipher = createDecipheriv(
      ENCRYPTION.algorithm,
      oldKey,
      iv,
      { authTagLength: tagLen }
    )
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()])

    // 用新密钥重新加密
    const newSalt = randomBytes(ENCRYPTION.saltLength)
    const newKey = pbkdf2Sync(
      newPassword,
      newSalt,
      ENCRYPTION.iterations,
      ENCRYPTION.keyLength,
      'sha512'
    )
    const newIv = randomBytes(ENCRYPTION.ivLength)
    const cipher = createCipheriv(
      ENCRYPTION.algorithm,
      newKey,
      newIv,
      { authTagLength: ENCRYPTION.authTagLength }
    )
    const newEncrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const newAuthTag = cipher.getAuthTag()

    // 更新内部状态
    this.key = newKey
    this.salt = newSalt

    this.emit('encryption:rotated', {} as SecurityEvents['encryption:rotated'])

    return {
      data: Buffer.concat([newIv, newAuthTag, newEncrypted]),
      salt: newSalt,
    }
  }

  /**
   * 计算 SHA-256 校验和
   * @param data 输入数据
   * @returns 十六进制校验和字符串
   */
  computeChecksum(data: string | Buffer): string {
    const hash = createHash('sha256')
    hash.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    return hash.digest('hex')
  }

  /**
   * 安全销毁密钥材料
   * 将密钥和盐的内存区域填零
   */
  destroy(): void {
    if (this.key) {
      this.key.fill(0)
      this.key = null
    }
    if (this.salt) {
      this.salt.fill(0)
      this.salt = null
    }
    this.initialized = false
    this.removeAllListeners()
  }

  /** 断言已初始化 */
  private assertInitialized(): void {
    if (!this.initialized || !this.key) {
      throw new Error('EncryptionService 未初始化，请先调用 initialize(password)')
    }
  }
}

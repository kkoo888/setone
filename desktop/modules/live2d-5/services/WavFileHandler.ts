/**
 * WAV 音频文件处理器
 *
 * 解析 WAV 文件，计算 RMS 值用于 LipSync 口型同步。
 * 实现 IParameterProvider 接口，可直接传给 CubismLipSyncUpdater。
 *
 * 对标 Demo LAppWavFileHandler。
 *
 * @see CubismLipSyncUpdater (lib/motion/cubismlipsyncupdater.ts)
 * @see IParameterProvider (lib/motion/iparameterprovider.ts)
 */

import { IParameterProvider } from '../lib/motion/iparameterprovider'

/** WAV 文件信息 */
interface WavFileInfo {
  _fileName: string
  _numberOfChannels: number
  _samplingRate: number
  _bitsPerSample: number
  _samplesPerChannel: number
}

/** 字节读取器 */
class ByteReader {
  _fileByte: ArrayBuffer | null = null
  _fileDataView: DataView | null = null
  _fileSize: number = 0
  _readOffset: number = 0

  get8(): number {
    const val = this._fileDataView.getUint8(this._readOffset)
    this._readOffset += 1
    return val
  }

  get16LittleEndian(): number {
    const val = this._fileDataView.getUint16(this._readOffset, true)
    this._readOffset += 2
    return val
  }

  get24LittleEndian(): number {
    const val1 = this.get16LittleEndian()
    const val2 = this.get8()
    return val1 | (val2 << 16)
  }

  get32LittleEndian(): number {
    const val = this._fileDataView.getUint32(this._readOffset, true)
    this._readOffset += 4
    return val
  }

  getCheckSignature(signature: string): boolean {
    if (this._readOffset + signature.length > this._fileSize) return false

    let str = ''
    for (let i = 0; i < signature.length; i++) {
      str += String.fromCharCode(
        this._fileDataView.getUint8(this._readOffset + i)
      )
    }
    if (str === signature) {
      this._readOffset += signature.length
      return true
    }
    return false
  }
}

/**
 * WAV 文件处理器 — 实现 IParameterProvider
 * 用于 LipSync 的音频源
 */
export class WavFileHandler extends IParameterProvider {
  private _pcmData: Float32Array[] | null = null
  private _wavFileInfo: WavFileInfo = {
    _fileName: '',
    _numberOfChannels: 0,
    _samplingRate: 0,
    _bitsPerSample: 0,
    _samplesPerChannel: 0
  }
  private _byteReader: ByteReader = new ByteReader()
  private _sampleOffset: number = 0
  private _userTimeSeconds: number = 0
  private _lastRms: number = 0

  /**
   * 更新处理（每帧调用）
   * @param deltaTimeSeconds 帧间隔时间
   * @return 是否有新数据
   */
  update(deltaTimeSeconds?: number): boolean {
    if (
      this._pcmData == null ||
      this._sampleOffset >= this._wavFileInfo._samplesPerChannel
    ) {
      this._lastRms = 0.0
      return false
    }

    const actualDeltaTime: number = deltaTimeSeconds ?? 1.0 / 60.0
    this._userTimeSeconds += actualDeltaTime

    let goalOffset = Math.floor(
      this._userTimeSeconds * this._wavFileInfo._samplingRate
    )
    if (goalOffset > this._wavFileInfo._samplesPerChannel) {
      goalOffset = this._wavFileInfo._samplesPerChannel
    }

    // RMS 计算
    let rms = 0.0
    for (
      let channelCount = 0;
      channelCount < this._wavFileInfo._numberOfChannels;
      channelCount++
    ) {
      for (
        let sampleCount = this._sampleOffset;
        sampleCount < goalOffset;
        sampleCount++
      ) {
        const pcm = this._pcmData[channelCount][sampleCount]
        rms += pcm * pcm
      }
    }
    rms = Math.sqrt(
      rms /
        (this._wavFileInfo._numberOfChannels *
          (goalOffset - this._sampleOffset))
    )

    this._lastRms = rms
    this._sampleOffset = goalOffset
    return true
  }

  /**
   * 获取参数值（LipSync 使用）
   * @return RMS 值
   */
  getParameter(): number {
    return this._lastRms
  }

  /**
   * 开始播放 WAV 文件
   * @param filePath WAV 文件路径
   */
  start(filePath: string): void {
    this._sampleOffset = 0
    this._userTimeSeconds = 0.0
    this._lastRms = 0.0
    this.loadWavFile(filePath)
  }

  /**
   * 加载 WAV 文件
   * @param filePath 文件路径
   */
  async loadWavFile(filePath: string): Promise<boolean> {
    if (this._pcmData != null) {
      this.releasePcmData()
    }

    try {
      const response = await fetch(filePath)
      if (!response.ok) {
        console.warn(`[WavFileHandler] ⚠️ 文件加载失败: ${filePath}`)
        return false
      }

      this._byteReader._fileByte = await response.arrayBuffer()
      this._byteReader._fileDataView = new DataView(this._byteReader._fileByte)
      this._byteReader._fileSize = this._byteReader._fileByte.byteLength
      this._byteReader._readOffset = 0

      if (
        this._byteReader._fileByte == null ||
        this._byteReader._fileSize < 4
      ) {
        return false
      }

      this._wavFileInfo._fileName = filePath

      // 签名 "RIFF"
      if (!this._byteReader.getCheckSignature('RIFF')) {
        throw new Error('Cannot find Signature "RIFF".')
      }
      // 文件大小-8（跳过）
      this._byteReader.get32LittleEndian()
      // 签名 "WAVE"
      if (!this._byteReader.getCheckSignature('WAVE')) {
        throw new Error('Cannot find Signature "WAVE".')
      }
      // 签名 "fmt "
      if (!this._byteReader.getCheckSignature('fmt ')) {
        throw new Error('Cannot find Signature "fmt".')
      }
      // fmt 块大小
      const fmtChunkSize = this._byteReader.get32LittleEndian()
      // 格式 ID（仅支持 1 = 线性 PCM）
      if (this._byteReader.get16LittleEndian() != 1) {
        throw new Error('File is not linear PCM.')
      }
      // 通道数
      this._wavFileInfo._numberOfChannels = this._byteReader.get16LittleEndian()
      // 采样率
      this._wavFileInfo._samplingRate = this._byteReader.get32LittleEndian()
      // 数据速率（跳过）
      this._byteReader.get32LittleEndian()
      // 块大小（跳过）
      this._byteReader.get16LittleEndian()
      // 量化位数
      this._wavFileInfo._bitsPerSample = this._byteReader.get16LittleEndian()

      // fmt 块扩展部分跳过
      if (fmtChunkSize > 16) {
        this._byteReader._readOffset += fmtChunkSize - 16
      }

      // 跳过直到 "data" 块
      while (
        !this._byteReader.getCheckSignature('data') &&
        this._byteReader._readOffset < this._byteReader._fileSize
      ) {
        this._byteReader._readOffset +=
          this._byteReader.get32LittleEndian() + 4
      }

      if (this._byteReader._readOffset >= this._byteReader._fileSize) {
        throw new Error('Cannot find "data" Chunk.')
      }

      // 采样数
      const dataChunkSize = this._byteReader.get32LittleEndian()
      this._wavFileInfo._samplesPerChannel =
        (dataChunkSize * 8) /
        (this._wavFileInfo._bitsPerSample *
          this._wavFileInfo._numberOfChannels)

      // 分配内存
      this._pcmData = new Array(this._wavFileInfo._numberOfChannels)
      for (
        let channelCount = 0;
        channelCount < this._wavFileInfo._numberOfChannels;
        channelCount++
      ) {
        this._pcmData[channelCount] = new Float32Array(
          this._wavFileInfo._samplesPerChannel
        )
      }

      // 读取波形数据
      for (
        let sampleCount = 0;
        sampleCount < this._wavFileInfo._samplesPerChannel;
        sampleCount++
      ) {
        for (
          let channelCount = 0;
          channelCount < this._wavFileInfo._numberOfChannels;
          channelCount++
        ) {
          this._pcmData[channelCount][sampleCount] = this.getPcmSample()
        }
      }

      return true
    } catch (e) {
      console.error(`[WavFileHandler] ❌ WAV 解析失败:`, e)
      return false
    }
  }

  /**
   * 获取单个 PCM 采样值
   */
  private getPcmSample(): number {
    let pcm32: number

    switch (this._wavFileInfo._bitsPerSample) {
      case 8:
        pcm32 = this._byteReader.get8() - 128
        pcm32 <<= 24
        break
      case 16:
        pcm32 = this._byteReader.get16LittleEndian() << 16
        break
      case 24:
        pcm32 = this._byteReader.get24LittleEndian() << 8
        break
      default:
        pcm32 = 0
        break
    }

    return pcm32 / 2147483647
  }

  /**
   * 获取指定通道的 PCM 数据
   * @param channel 通道索引
   */
  getPcmDataChannel(channel: number): Float32Array | null {
    if (this._pcmData == null || channel < 0 || channel >= this._wavFileInfo._numberOfChannels) {
      return null
    }
    return this._pcmData[channel]
  }

  /** 释放 PCM 数据 */
  private releasePcmData(): void {
    this._pcmData = null
    this._byteReader._fileByte = null
    this._byteReader._fileDataView = null
  }
}

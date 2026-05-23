/**
 * 麦克风音频输入处理器
 * 用于实时 LipSync 口型同步
 *
 * 使用 Web Audio API 获取麦克风输入，计算 RMS 值
 */

import { IParameterProvider } from '../lib/motion/iparameterprovider'

/**
 * 麦克风音频处理器 — 实现 IParameterProvider
 * 用于实时 LipSync 的音频源
 */
export class MicrophoneHandler extends IParameterProvider {
  private _audioContext: AudioContext | null = null
  private _mediaStream: MediaStream | null = null
  private _source: MediaStreamAudioSourceNode | null = null
  private _analyser: AnalyserNode | null = null
  private _dataArray: Float32Array | null = null
  private _lastRms: number = 0
  private _isActive: boolean = false
  private _smoothing: number = 0.3 // 平滑系数 (0-1，越大越平滑)
  private _gain: number = 1.0 // 增益系数

  /**
   * 开始麦克风输入
   * @returns 是否成功开始
   */
  async start(): Promise<boolean> {
    try {
      // 请求麦克风权限
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      // 创建音频上下文
      this._audioContext = new AudioContext()

      // 创建音频源
      this._source = this._audioContext.createMediaStreamSource(this._mediaStream)

      // 创建分析器
      this._analyser = this._audioContext.createAnalyser()
      this._analyser.fftSize = 256
      this._analyser.smoothingTimeConstant = 0.5

      // 连接音频节点
      this._source.connect(this._analyser)

      // 创建数据数组
      this._dataArray = new Float32Array(this._analyser.frequencyBinCount)

      this._isActive = true
      console.debug('[MicrophoneHandler] ✅ 麦克风输入已启动')
      return true
    } catch (err) {
      console.error('[MicrophoneHandler] ❌ 麦克风启动失败:', err)
      this.stop()
      return false
    }
  }

  /**
   * 停止麦克风输入
   */
  stop(): void {
    this._isActive = false

    if (this._source) {
      this._source.disconnect()
      this._source = null
    }

    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach(track => track.stop())
      this._mediaStream = null
    }

    if (this._audioContext) {
      this._audioContext.close()
      this._audioContext = null
    }

    this._analyser = null
    this._dataArray = null
    this._lastRms = 0

    console.debug('[MicrophoneHandler] ⏹️ 麦克风输入已停止')
  }

  /**
   * 更新处理（每帧调用）
   * @param deltaTimeSeconds 帧间隔时间
   * @returns 是否有新数据
   */
  update(deltaTimeSeconds?: number): boolean {
    if (!this._isActive || !this._analyser || !this._dataArray) {
      this._lastRms = 0
      return false
    }

    try {
      // 获取时域数据
      this._analyser.getFloatTimeDomainData(this._dataArray)

      // 计算 RMS
      let sum = 0
      for (let i = 0; i < this._dataArray.length; i++) {
        const sample = this._dataArray[i]
        sum += sample * sample
      }
      const rms = Math.sqrt(sum / this._dataArray.length)

      // 应用增益和平滑
      const targetRms = Math.min(1.0, rms * this._gain * 5) // 乘以 5 放大信号
      this._lastRms = this._lastRms + (targetRms - this._lastRms) * this._smoothing

      return true
    } catch {
      return false
    }
  }

  /**
   * 获取参数值（LipSync 使用）
   * @returns RMS 值 (0-1)
   */
  getParameter(): number {
    return this._lastRms
  }

  /**
   * 设置平滑系数
   * @param value 平滑系数 (0-1)
   */
  setSmoothing(value: number): void {
    this._smoothing = Math.max(0, Math.min(1, value))
  }

  /**
   * 设置增益系数
   * @param value 增益系数
   */
  setGain(value: number): void {
    this._gain = Math.max(0, value)
  }

  /**
   * 是否正在运行
   */
  get isRunning(): boolean {
    return this._isActive
  }
}

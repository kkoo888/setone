/**
 * 触摸/鼠标手势管理器
 *
 * 管理触摸/鼠标事件状态，计算拖拽增量和缩放。
 * 对标 Demo TouchManager。
 *
 * 支持：
 * - 单指拖拽（deltaX/deltaY）
 * - 双指缩放（pinch scale）
 * - Flick 检测
 */

export class TouchManager {
  private _startX: number = 0
  private _startY: number = 0
  private _lastX: number = 0
  private _lastY: number = 0
  private _lastX1: number = 0
  private _lastY1: number = 0
  private _lastX2: number = 0
  private _lastY2: number = 0
  private _lastTouchDistance: number = 0
  private _deltaX: number = 0
  private _deltaY: number = 0
  private _scale: number = 1.0
  private _touchSingle: boolean = false
  private _flipAvailable: boolean = false

  getCenterX(): number { return this._lastX }
  getCenterY(): number { return this._lastY }
  getDeltaX(): number { return this._deltaX }
  getDeltaY(): number { return this._deltaY }
  getStartX(): number { return this._startX }
  getStartY(): number { return this._startY }
  getScale(): number { return this._scale }
  getX(): number { return this._lastX }
  getY(): number { return this._lastY }
  getX1(): number { return this._lastX1 }
  getY1(): number { return this._lastY1 }
  getX2(): number { return this._lastX2 }
  getY2(): number { return this._lastY2 }
  isSingleTouch(): boolean { return this._touchSingle }
  isFlickAvailable(): boolean { return this._flipAvailable }

  disableFlick(): void {
    this._flipAvailable = false
  }

  /**
   * 触摸/按下开始
   * @param deviceX 设备 X 坐标
   * @param deviceY 设备 Y 坐标
   */
  touchesBegan(deviceX: number, deviceY: number): void {
    this._lastX = deviceX
    this._lastY = deviceY
    this._startX = deviceX
    this._startY = deviceY
    this._lastTouchDistance = -1.0
    this._flipAvailable = true
    this._touchSingle = true
  }

  /**
   * 触摸/拖拽移动
   * @param deviceX 设备 X 坐标
   * @param deviceY 设备 Y 坐标
   */
  touchesMoved(deviceX: number, deviceY: number): void {
    this._lastX = deviceX
    this._lastY = deviceY
    this._lastTouchDistance = -1.0
    this._touchSingle = true
  }

  /**
   * 双指触摸移动（缩放）
   * @param deviceX1 第一个触摸点 X
   * @param deviceY1 第一个触摸点 Y
   * @param deviceX2 第二个触摸点 X
   * @param deviceY2 第二个触摸点 Y
   */
  touchesMovedTwoPoint(
    deviceX1: number, deviceY1: number,
    deviceX2: number, deviceY2: number
  ): void {
    const distance = this.calculateDistance(deviceX1, deviceY1, deviceX2, deviceY2)
    const centerX = (deviceX1 + deviceX2) * 0.5
    const centerY = (deviceY1 + deviceY2) * 0.5

    if (this._lastTouchDistance > 0) {
      this._scale = distance / this._lastTouchDistance
      this._deltaX = this.calculateMovingAmount(
        centerX - this._lastX,
        this._lastX1 - this._lastX2
      )
      this._deltaY = this.calculateMovingAmount(
        centerY - this._lastY,
        this._lastY1 - this._lastY2
      )
    } else {
      this._scale = 1.0
      this._deltaX = 0
      this._deltaY = 0
    }

    this._lastX = centerX
    this._lastY = centerY
    this._lastX1 = deviceX1
    this._lastY1 = deviceY1
    this._lastX2 = deviceX2
    this._lastY2 = deviceY2
    this._lastTouchDistance = distance
    this._touchSingle = false
  }

  /**
   * 获取 Flick 距离
   */
  getFlickDistance(): number {
    return this.calculateDistance(
      this._startX, this._startY,
      this._lastX, this._lastY
    )
  }

  /**
   * 计算两点距离
   */
  private calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
  }

  /**
   * 计算移动量（同方向取较小值，反方向为 0）
   */
  private calculateMovingAmount(v1: number, v2: number): number {
    if (v1 > 0.0 !== v2 > 0.0) {
      return 0.0
    }
    const sign = v1 > 0.0 ? 1.0 : -1.0
    const abs1 = Math.abs(v1)
    const abs2 = Math.abs(v2)
    return sign * (abs1 < abs2 ? abs1 : abs2)
  }
}

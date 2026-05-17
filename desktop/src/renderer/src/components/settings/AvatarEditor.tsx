import React, { useRef, useState, useCallback, useEffect } from 'react'

interface AvatarEditorProps {
  /** 图片 data URL */
  imageSrc: string
  /** 确认裁剪回调，返回 base64 data URL */
  onConfirm: (dataUrl: string) => void
  /** 取消回调 */
  onCancel: () => void
}

/** 裁剪区域边长（px） */
const CROP_SIZE = 200
/** 输出图片尺寸（px） */
const OUTPUT_SIZE = 256
/** 最大文件大小 500KB */
const MAX_FILE_BYTES = 500 * 1024

/**
 * 将 canvas 导出为压缩后的 base64 data URL
 * 如果超过 MAX_FILE_BYTES 则逐步降低质量
 */
function exportCompressedDataUrl(canvas: HTMLCanvasElement): string {
  let quality = 0.92
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_FILE_BYTES * 1.37 && quality > 0.1) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  return dataUrl
}

export function AvatarEditor({ imageSrc, onConfirm, onCancel }: AvatarEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)

  /** 加载图片 */
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageRef.current = img
      setImageLoaded(true)
      // 初始缩放：让图片短边填满裁剪框
      const minDim = Math.min(img.width, img.height)
      const initScale = CROP_SIZE / minDim
      setScale(initScale)
      // 居中偏移
      setOffset({
        x: (CROP_SIZE - img.width * initScale) / 2,
        y: (CROP_SIZE - img.height * initScale) / 2,
      })
    }
    img.src = imageSrc
  }, [imageSrc])

  /** 绘制裁剪预览 */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = CROP_SIZE
    canvas.height = CROP_SIZE

    // 清空
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE)

    // 绘制图片
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale)
  }, [scale, offset])

  useEffect(() => {
    draw()
  }, [draw])

  /** 滚轮缩放 */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setScale((prev) => Math.max(0.1, Math.min(5, prev + delta)))
  }, [])

  /** 拖拽开始 */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }, [offset])

  /** 拖拽中 */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }, [dragging, dragStart])

  /** 拖拽结束 */
  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  /** 触摸事件支持 */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    setDragging(true)
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y })
  }, [offset])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return
    const touch = e.touches[0]
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    })
  }, [dragging, dragStart])

  const handleTouchEnd = useCallback(() => {
    setDragging(false)
  }, [])

  /** 确认裁剪 */
  const handleConfirm = useCallback(() => {
    const img = imageRef.current
    if (!img) return

    const outCanvas = document.createElement('canvas')
    outCanvas.width = OUTPUT_SIZE
    outCanvas.height = OUTPUT_SIZE
    const ctx = outCanvas.getContext('2d')
    if (!ctx) return

    // 计算源区域：将裁剪框映射回原图坐标
    const sx = -offset.x / scale
    const sy = -offset.y / scale
    const sw = CROP_SIZE / scale
    const sh = CROP_SIZE / scale

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    const dataUrl = exportCompressedDataUrl(outCanvas)
    onConfirm(dataUrl)
  }, [offset, scale, onConfirm])

  /** 缩放滑块 */
  const handleScaleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(parseFloat(e.target.value))
  }, [])

  return (
    <div className="avatar-editor-overlay" onClick={onCancel}>
      <div className="avatar-editor" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-editor-header">
          <h3>裁剪头像</h3>
          <p>拖动图片调整位置，滚轮或滑块缩放</p>
        </div>

        <div className="avatar-editor-body">
          <div
            ref={containerRef}
            className="avatar-editor-crop-area"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* 半透明遮罩 + 裁剪框 */}
            <div className="avatar-editor-mask">
              <div className="avatar-editor-crop-window">
                <canvas
                  ref={canvasRef}
                  width={CROP_SIZE}
                  height={CROP_SIZE}
                  className="avatar-editor-canvas"
                />
              </div>
            </div>
          </div>

          <div className="avatar-editor-controls">
            <label className="avatar-editor-scale-label">
              <span>缩放</span>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.01}
                value={scale}
                onChange={handleScaleChange}
                className="avatar-editor-scale-slider"
              />
            </label>
          </div>

          {/* 预览 */}
          <div className="avatar-editor-preview">
            <span className="avatar-editor-preview-label">预览</span>
            <div className="avatar-editor-preview-circle">
              {imageLoaded && (
                <PreviewCanvas
                  imageSrc={imageSrc}
                  offset={offset}
                  scale={scale}
                />
              )}
            </div>
          </div>
        </div>

        <div className="avatar-editor-footer">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  )
}

/** 预览圆形头像 */
function PreviewCanvas({ imageSrc, offset, scale }: {
  imageSrc: string
  offset: { x: number; y: number }
  scale: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const size = 80
      canvas.width = size
      canvas.height = size
      ctx.clearRect(0, 0, size, size)

      // 裁剪区域映射
      const sx = -offset.x / scale
      const sy = -offset.y / scale
      const sw = CROP_SIZE / scale
      const sh = CROP_SIZE / scale

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)
    }
    img.src = imageSrc
  }, [imageSrc, offset, scale])

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={80}
      className="avatar-editor-preview-canvas"
    />
  )
}

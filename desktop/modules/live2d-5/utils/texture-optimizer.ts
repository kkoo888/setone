/**
 * 纹理优化工具
 * 提供纹理尺寸限制和格式转换功能
 */

/** 纹理配置 */
export interface TextureOptimizeConfig {
  /** 最大宽度（默认 2048） */
  maxWidth?: number
  /** 最大高度（默认 2048） */
  maxHeight?: number
  /** 是否启用 WebP 转换（默认 true） */
  enableWebP?: boolean
  /** WebP 质量（0-1，默认 0.85） */
  webpQuality?: number
}

/** 默认配置 */
const DEFAULT_CONFIG: Required<TextureOptimizeConfig> = {
  maxWidth: 2048,
  maxHeight: 2048,
  enableWebP: true,
  webpQuality: 0.85
}

/**
 * 检查纹理是否需要优化
 * @param width 纹理宽度
 * @param height 纹理高度
 * @param config 配置
 * @returns 是否需要优化
 */
export function needsOptimization(
  width: number, 
  height: number, 
  config?: TextureOptimizeConfig
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  return width > cfg.maxWidth || height > cfg.maxHeight
}

/**
 * 计算缩放后的尺寸（保持宽高比）
 * @param originalWidth 原始宽度
 * @param originalHeight 原始高度
 * @param maxWidth 最大宽度
 * @param maxHeight 最大高度
 * @returns 缩放后的尺寸
 */
export function calculateScaledSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number; scale: number } {
  let scale = 1

  if (originalWidth > maxWidth) {
    scale = Math.min(scale, maxWidth / originalWidth)
  }
  if (originalHeight > maxHeight) {
    scale = Math.min(scale, maxHeight / originalHeight)
  }

  return {
    width: Math.floor(originalWidth * scale),
    height: Math.floor(originalHeight * scale),
    scale
  }
}

/**
 * 优化纹理（缩小尺寸）
 * @param image 原始图片
 * @param config 配置
 * @returns 优化后的 canvas
 */
export function optimizeTexture(
  image: HTMLImageElement,
  config?: TextureOptimizeConfig
): HTMLCanvasElement | null {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  const { width, height, scale } = calculateScaledSize(
    image.naturalWidth,
    image.naturalHeight,
    cfg.maxWidth,
    cfg.maxHeight
  )

  // 如果不需要缩放，返回 null
  if (scale >= 1) {
    return null
  }

  console.debug(`[TextureOptimize] 缩放纹理: ${image.naturalWidth}x${image.naturalHeight} → ${width}x${height}`)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  // 使用高质量缩放
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)

  return canvas
}

/**
 * 转换为 WebP 格式
 * @param canvas Canvas 元素
 * @param quality 质量 (0-1)
 * @returns WebP Blob
 */
export function convertToWebP(
  canvas: HTMLCanvasElement,
  quality: number = 0.85
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/webp',
      quality
    )
  })
}

/**
 * 检测浏览器是否支持 WebP
 * @returns 是否支持
 */
export function supportsWebP(): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
}

/**
 * 获取纹理内存占用估算（字节）
 * @param width 宽度
 * @param height 高度
 * @param channels 通道数（RGBA = 4）
 * @returns 估算的内存占用
 */
export function estimateTextureMemory(
  width: number,
  height: number,
  channels: number = 4
): number {
  return width * height * channels
}

/**
 * 格式化内存大小为可读字符串
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatMemorySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

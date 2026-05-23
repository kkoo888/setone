/**
 * 检测 WebGL 渲染器信息
 * 用于判断是否为软件渲染
 */
export function getWebGLRendererInfo(gl: WebGLRenderingContext): {
  renderer: string
  vendor: string
  isSoftwareRenderer: boolean
  warning: string | null
} {
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  
  if (!debugInfo) {
    return {
      renderer: 'unknown',
      vendor: 'unknown',
      isSoftwareRenderer: false,
      warning: null
    }
  }

  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown'
  const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown'

  // 检测是否为软件渲染器
  const softwareRenderers = [
    'SwiftShader',           // Google 的软件渲染器
    'llvmpipe',              // Mesa 的软件渲染器
    'Software Rasterizer',   // 通用软件渲染器
    'Microsoft Basic Render', // Windows 基础渲染器
    'Google SwiftShader',
    'Chromium'
  ]

  const isSoftwareRenderer = softwareRenderers.some(name => 
    renderer.toLowerCase().includes(name.toLowerCase())
  )

  let warning: string | null = null
  if (isSoftwareRenderer) {
    warning = `检测到软件渲染器 (${renderer})，性能可能较差`
    console.warn('[WebGL] ⚠️', warning)
  }

  return {
    renderer,
    vendor,
    isSoftwareRenderer,
    warning
  }
}

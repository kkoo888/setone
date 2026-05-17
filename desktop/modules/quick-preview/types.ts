/** 文件预览参数 */
export interface FilePreviewParams {
  path: string
}

/** 预览结果 */
export interface FilePreviewResult {
  path: string
  content: string
  type: 'text' | 'image'
  size: number
  modified: number
}

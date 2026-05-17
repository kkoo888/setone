import React, { useMemo } from 'react'
import type { PreviewFile } from '../../stores/useChangesStore'

/**
 * 简单的 Markdown 转 HTML 解析器
 * 支持标题、粗体、斜体、代码块、行内代码、列表、链接、引用、水平线
 */
function parseMarkdown(text: string): string {
  const lines = text.split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let codeBuffer: string[] = []
  let inList = false
  let listType: 'ul' | 'ol' = 'ul'

  const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const parseInline = (s: string): string => {
    let result = escapeHtml(s)
    // 行内代码
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>')
    // 链接
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // 图片
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // 粗体
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // 斜体
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    result = result.replace(/_([^_]+)_/g, '<em>$1</em>')
    // 删除线
    result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>')
    return result
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 代码块
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
        codeBuffer = []
        inCodeBlock = false
      } else {
        if (inList) {
          html.push(`</${listType}>`)
          inList = false
        }
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeBuffer.push(line)
      continue
    }

    const trimmed = line.trim()

    // 空行
    if (!trimmed) {
      if (inList) {
        html.push(`</${listType}>`)
        inList = false
      }
      continue
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      if (inList) {
        html.push(`</${listType}>`)
        inList = false
      }
      const level = headingMatch[1].length
      html.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`)
      continue
    }

    // 水平线
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (inList) {
        html.push(`</${listType}>`)
        inList = false
      }
      html.push('<hr />')
      continue
    }

    // 引用
    if (trimmed.startsWith('> ')) {
      if (inList) {
        html.push(`</${listType}>`)
        inList = false
      }
      html.push(`<blockquote><p>${parseInline(trimmed.slice(2))}</p></blockquote>`)
      continue
    }

    // 无序列表
    if (/^[-*+]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        if (inList) html.push(`</${listType}>`)
        html.push('<ul>')
        inList = true
        listType = 'ul'
      }
      html.push(`<li>${parseInline(trimmed.replace(/^[-*+]\s+/, ''))}</li>`)
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        if (inList) html.push(`</${listType}>`)
        html.push('<ol>')
        inList = true
        listType = 'ol'
      }
      html.push(`<li>${parseInline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`)
      continue
    }

    // 普通段落
    if (inList) {
      html.push(`</${listType}>`)
      inList = false
    }
    html.push(`<p>${parseInline(trimmed)}</p>`)
  }

  // 关闭未关闭的代码块
  if (inCodeBlock && codeBuffer.length > 0) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
  }

  // 关闭未关闭的列表
  if (inList) {
    html.push(`</${listType}>`)
  }

  return html.join('\n')
}

interface FilePreviewProps {
  file: PreviewFile
}

/**
 * 文件预览组件
 * 支持 Markdown 渲染和带行号的代码显示
 */
export function FilePreview({ file }: FilePreviewProps) {
  const lines = useMemo(() => file.content.split('\n'), [file.content])

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <span className="file-preview-path" title={file.path}>{file.path}</span>
        {file.language && <span>{file.language}</span>}
      </div>
      <div className="file-preview-body">
        {file.isMarkdown ? (
          <div
            className="file-preview-markdown"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(file.content) }}
          />
        ) : (
          <div className="file-preview-code">
            {lines.map((line, idx) => (
              <div key={idx} className="file-preview-code-line">
                <span className="file-preview-code-lineno">{idx + 1}</span>
                <span className="file-preview-code-content">{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

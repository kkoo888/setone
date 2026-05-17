import React from 'react'

/** 轻量 Markdown 解析器 — 支持代码块、行内代码、粗体、链接、换行 */
export interface MarkdownToken {
  type: 'text' | 'bold' | 'code-inline' | 'code-block' | 'link' | 'newline'
  content: string
  href?: string
  language?: string
}

export function parseMarkdown(text: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = []
  let remaining = text
  while (remaining.length > 0) {
    const codeBlockMatch = remaining.match(/^```(\w*)\n?([\s\S]*?)```/)
    if (codeBlockMatch) { tokens.push({ type: 'code-block', content: codeBlockMatch[2], language: codeBlockMatch[1] || undefined }); remaining = remaining.slice(codeBlockMatch[0].length); continue }
    const inlineCodeMatch = remaining.match(/^`([^`\n]+)`/)
    if (inlineCodeMatch) { tokens.push({ type: 'code-inline', content: inlineCodeMatch[1] }); remaining = remaining.slice(inlineCodeMatch[0].length); continue }
    const boldMatch = remaining.match(/^\*\*([^*]+?)\*\*/)
    if (boldMatch) { tokens.push({ type: 'bold', content: boldMatch[1] }); remaining = remaining.slice(boldMatch[0].length); continue }
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) { tokens.push({ type: 'link', content: linkMatch[1], href: linkMatch[2] }); remaining = remaining.slice(linkMatch[0].length); continue }
    if (remaining[0] === '\n') { tokens.push({ type: 'newline', content: '\n' }); remaining = remaining.slice(1); continue }
    const textMatch = remaining.match(/^[^`*\[\n]+/)
    if (textMatch) { tokens.push({ type: 'text', content: textMatch[0] }); remaining = remaining.slice(textMatch[0].length); continue }
    tokens.push({ type: 'text', content: remaining[0] }); remaining = remaining.slice(1)
  }
  return tokens
}

export function renderTokens(tokens: MarkdownToken[]): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'bold': return <strong key={i}>{token.content}</strong>
      case 'code-inline': return <code key={i} className="inline-code">{token.content}</code>
      case 'code-block': return (<pre key={i} className="code-block">{token.language && <div className="code-block-lang">{token.language}</div>}<code>{token.content}</code></pre>)
      case 'link': return <a key={i} href={token.href} target="_blank" rel="noopener noreferrer">{token.content}</a>
      case 'newline': return <br key={i} />
      default: return <span key={i}>{token.content}</span>
    }
  })
}

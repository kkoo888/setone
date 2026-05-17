import React, { useState, useCallback } from 'react'
import type { FileNode } from '../../stores/useChangesStore'

interface FileTreeItemProps {
  node: FileNode
  depth: number
  onFileClick: (path: string) => void
}

/**
 * 文件树单个节点组件
 */
function FileTreeItem({ node, depth, onFileClick }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 1)

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      setExpanded((prev) => !prev)
    } else {
      onFileClick(node.path)
    }
  }, [node.type, node.path, onFileClick])

  const isDir = node.type === 'directory'

  return (
    <>
      <button
        className="file-tree-item"
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={handleClick}
        title={node.path}
      >
        <span className={`file-tree-arrow ${isDir ? (expanded ? 'file-tree-arrow--expanded' : '') : 'file-tree-arrow--hidden'}`}>
          ▶
        </span>
        <span className="file-tree-icon">
          {isDir ? (expanded ? '📂' : '📁') : '📄'}
        </span>
        <span className="file-tree-name">{node.name}</span>
      </button>
      {isDir && expanded && node.children && node.children.length > 0 && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </>
  )
}

interface FileTreeProps {
  nodes: FileNode[]
  onFileClick: (path: string) => void
}

/**
 * 文件树组件
 * 递归渲染目录结构
 */
export function FileTree({ nodes, onFileClick }: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="changes-empty">
        <span className="changes-empty-icon">📁</span>
        <span>暂无文件</span>
      </div>
    )
  }

  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  )
}

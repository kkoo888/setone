import { create } from 'zustand'

/** 变更文件信息 */
export interface ChangedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

/** 文件树节点 */
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

/** 预览文件信息 */
export interface PreviewFile {
  path: string
  content: string
  language?: string
  isMarkdown: boolean
}

/** 变更面板状态 */
interface ChangesState {
  isOpen: boolean
  activeTab: 'changes' | 'files' | 'preview'
  changedFiles: ChangedFile[]
  fileTree: FileNode[]
  previewFile: PreviewFile | null
  loading: boolean

  toggle: () => void
  open: () => void
  close: () => void
  setActiveTab: (tab: 'changes' | 'files' | 'preview') => void
  setChangedFiles: (files: ChangedFile[]) => void
  setFileTree: (tree: FileNode[]) => void
  setPreviewFile: (file: PreviewFile | null) => void
  setLoading: (v: boolean) => void
}

export const useChangesStore = create<ChangesState>()((set) => ({
  isOpen: false,
  activeTab: 'changes',
  changedFiles: [],
  fileTree: [],
  previewFile: null,
  loading: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setChangedFiles: (files) => set({ changedFiles: files }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setPreviewFile: (file) => set({ previewFile: file }),
  setLoading: (v) => set({ loading: v })
}))

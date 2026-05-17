import { create } from 'zustand'

interface CommandResult {
  id: string
  label: string
  description?: string
  category: string
  icon?: string
  shortcut?: string
  score: number
}

interface CommandPaletteState {
  isOpen: boolean
  query: string
  results: CommandResult[]
  selectedIndex: number
  loading: boolean

  open: (query?: string) => void
  close: () => void
  setQuery: (query: string) => void
  setResults: (results: CommandResult[]) => void
  setSelectedIndex: (index: number) => void
  moveUp: () => void
  moveDown: () => void
  executeSelected: () => void
}

export const useCommandPaletteStore = create<CommandPaletteState>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  selectedIndex: 0,
  loading: false,

  open: (query?: string) => {
    set({ isOpen: true, query: query ?? '', selectedIndex: 0 })
    // 打开时立即搜索
    if (query) {
      get().setQuery(query)
    } else {
      // 无初始查询，加载最近命令
      searchCommands('').then(results => set({ results }))
    }
  },

  close: () => {
    set({ isOpen: false, query: '', results: [], selectedIndex: 0 })
  },

  setQuery: (query: string) => {
    set({ query, selectedIndex: 0, loading: true })
    searchCommands(query).then(results => {
      set({ results, loading: false })
    })
  },

  setResults: (results: CommandResult[]) => set({ results }),

  setSelectedIndex: (index: number) => {
    const { results } = get()
    if (index >= 0 && index < results.length) {
      set({ selectedIndex: index })
    }
  },

  moveUp: () => {
    const { selectedIndex } = get()
    if (selectedIndex > 0) set({ selectedIndex: selectedIndex - 1 })
  },

  moveDown: () => {
    const { selectedIndex, results } = get()
    if (selectedIndex < results.length - 1) set({ selectedIndex: selectedIndex + 1 })
  },

  executeSelected: () => {
    const { results, selectedIndex } = get()
    const selected = results[selectedIndex]
    if (selected) {
      executeCommand(selected.id)
      get().close()
    }
  }
}))

/** 搜索命令（通过 IPC 调用主进程） */
async function searchCommands(query: string): Promise<CommandResult[]> {
  try {
    const results = await window.electronAPI.invoke('palette:search', { query })
    return (results as CommandResult[]) ?? []
  } catch (err) {
    console.error('[CommandPalette] 搜索失败:', err)
    return []
  }
}

/** 执行命令（通过 IPC 调用主进程） */
async function executeCommand(commandId: string): Promise<void> {
  try {
    await window.electronAPI.invoke('palette:execute', { commandId })
  } catch (err) {
    console.error('[CommandPalette] 执行失败:', err)
  }
}

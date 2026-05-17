import type { ScannedModule } from './module-scanner'

export interface ResolutionResult {
  order: string[]
  errors: DependencyError[]
}

export interface DependencyError {
  moduleId: string
  type: 'missing' | 'incompatible' | 'circular'
  message: string
}

export class DependencyResolver {
  resolve(modules: ScannedModule[]): ResolutionResult {
    const errors: DependencyError[] = []
    const moduleMap = new Map(modules.map(m => [m.meta.id, m]))

    console.log(`[DependencyResolver] \u5f00\u59cb\u89e3\u6790 ${modules.length} \u4e2a\u6a21\u5757\u7684\u4f9d\u8d56\u5173\u7cfb`)

    // 1. 检查依赖是否存在
    for (const mod of modules) {
      for (const dep of mod.meta.dependencies) {
        if (!moduleMap.has(dep)) {
          console.warn(`[DependencyResolver] \u26a0\ufe0f \u6a21\u5757 "${mod.meta.id}" \u4f9d\u8d56 "${dep}" \u672a\u627e\u5230\uff08\u8fd9\u4e0d\u662f\u4e00\u4e2a\u5df2\u6ce8\u518c\u7684\u6a21\u5757ID\uff09`)
          errors.push({
            moduleId: mod.meta.id,
            type: 'missing',
            message: `缺少依赖模块: ${dep}`
          })
        } else {
          console.log(`[DependencyResolver] \u2713 \u6a21\u5757 "${mod.meta.id}" \u4f9d\u8d56 "${dep}" \u5df2\u627e\u5230`)
        }
      }
    }

    // 2. 检测循环依赖
    const cycles = this.detectCycles(modules)
    errors.push(...cycles)
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        console.error(`[DependencyResolver] \u1f504 \u5faa\u73af\u4f9d\u8d56: ${cycle.message}`)
      }
    }

    // 3. 排除有问题的模块，对剩余模块执行拓扑排序
    const problematicIds = new Set(errors.map(e => e.moduleId))
    const validModules = modules.filter(m => !problematicIds.has(m.meta.id))

    console.log(`[DependencyResolver] \u6709\u6548\u6a21\u5757: ${validModules.length}/${modules.length}\uff0c\u95ee\u9898\u6a21\u5757: ${problematicIds.size}`)

    const order = this.topologicalSort(validModules)
    console.log(`[DependencyResolver] \u62d3\u6251\u6392\u5e8f\u7ed3\u679c: [${order.join(' \u2192 ')}]`)

    return { order, errors }
  }

  private detectCycles(modules: ScannedModule[]): DependencyError[] {
    const errors: DependencyError[] = []
    const adjacency = new Map<string, string[]>()
    const visited = new Set<string>()
    const inStack = new Set<string>()

    for (const mod of modules) {
      adjacency.set(mod.meta.id, mod.meta.dependencies)
    }

    const dfs = (nodeId: string, path: string[]): boolean => {
      if (inStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId)
        const cycle = path.slice(cycleStart).concat(nodeId)
        const cycleMessage = `检测到循环依赖: ${cycle.join(' → ')}`
        for (const cycleNodeId of cycle.slice(0, -1)) {
          errors.push({
            moduleId: cycleNodeId,
            type: 'circular',
            message: cycleMessage
          })
        }
        return true
      }

      if (visited.has(nodeId)) return false

      visited.add(nodeId)
      inStack.add(nodeId)

      const deps = adjacency.get(nodeId) || []
      for (const dep of deps) {
        if (dfs(dep, [...path, nodeId])) {
          // 继续遍历以收集所有循环节点
        }
      }

      inStack.delete(nodeId)
      return false
    }

    for (const mod of modules) {
      if (!visited.has(mod.meta.id)) {
        dfs(mod.meta.id, [])
      }
    }

    return errors
  }

  private topologicalSort(modules: ScannedModule[]): string[] {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    const moduleIds = new Set(modules.map(m => m.meta.id))
    const priorityMap = new Map(modules.map(m => [m.meta.id, m.meta.priority]))

    for (const mod of modules) {
      inDegree.set(mod.meta.id, 0)
      adjacency.set(mod.meta.id, [])
    }

    for (const mod of modules) {
      for (const dep of mod.meta.dependencies) {
        if (moduleIds.has(dep)) {
          adjacency.get(dep)?.push(mod.meta.id)
          inDegree.set(mod.meta.id, (inDegree.get(mod.meta.id) || 0) + 1)
        }
      }
    }

    // 最小堆优先队列（按 priority 排序）
    const heap: string[] = []

    const heapPush = (id: string): void => {
      heap.push(id)
      let i = heap.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if ((priorityMap.get(heap[parent]) || 999) <= (priorityMap.get(heap[i]) || 999)) break
        ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
        i = parent
      }
    }

    const heapPop = (): string | undefined => {
      if (heap.length === 0) return undefined
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length > 0) {
        heap[0] = last
        let i = 0
        while (true) {
          let min = i
          const left = 2 * i + 1
          const right = 2 * i + 2
          if (left < heap.length &&
              (priorityMap.get(heap[left]) || 999) < (priorityMap.get(heap[min]) || 999)) {
            min = left
          }
          if (right < heap.length &&
              (priorityMap.get(heap[right]) || 999) < (priorityMap.get(heap[min]) || 999)) {
            min = right
          }
          if (min === i) break
          ;[heap[i], heap[min]] = [heap[min], heap[i]]
          i = min
        }
      }
      return top
    }

    for (const [id, degree] of inDegree) {
      if (degree === 0) heapPush(id)
    }

    const result: string[] = []

    while (heap.length > 0) {
      const current = heapPop()!
      result.push(current)

      const neighbors = adjacency.get(current) || []
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) {
          heapPush(neighbor)
        }
      }
    }

    return result
  }
}

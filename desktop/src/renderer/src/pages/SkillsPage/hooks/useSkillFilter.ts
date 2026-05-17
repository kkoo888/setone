/**
 * 技能过滤 Hook
 * 基于标签和搜索关键词过滤技能列表
 */
import { useMemo } from 'react'
import type { SkillMeta } from '../../../stores/useSkillStore'

/**
 * 过滤技能列表
 * @param skills - 全部技能
 * @param activeTag - 当前激活的标签（'全部' 表示不过滤）
 * @param searchQuery - 搜索关键词
 * @returns 过滤后的技能列表
 */
export function useSkillFilter(
  skills: SkillMeta[],
  activeTag: string,
  searchQuery: string
): SkillMeta[] {
  return useMemo(() => {
    let result = skills

    // 按标签过滤
    if (activeTag && activeTag !== '全部') {
      result = result.filter((s) => s.tags.includes(activeTag))
    }

    // 按搜索关键词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((t) => t.toLowerCase().includes(query))
      )
    }

    return result
  }, [skills, activeTag, searchQuery])
}

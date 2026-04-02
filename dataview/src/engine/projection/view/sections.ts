import type {
  GroupGroupBy
} from '@dataview/core/contracts'
import type {
  Section,
  SectionKey
} from './types'
import type {
  ProjectionSection
} from './projection'

const emptyIds = [] as const

export const createSections = (
  source: readonly ProjectionSection[],
  group: GroupGroupBy | undefined
): readonly Section[] => {
  if (!group) {
    return source.map(section => ({
      ...section,
      collapsed: false
    }))
  }

  const showEmpty = group.showEmpty !== false

  return source.flatMap(section => {
    const state = group.buckets?.[section.key]
    if (state?.hidden === true) {
      return []
    }

    if (!showEmpty && section.ids.length === 0) {
      return []
    }

    return [{
      ...section,
      collapsed: state?.collapsed === true
    } satisfies Section]
  })
}

export const sectionIds = (
  source: readonly Pick<Section, 'key' | 'ids'>[],
  sectionKey: SectionKey
) => source.find(section => section.key === sectionKey)?.ids ?? emptyIds

export const sections = {
  create: createSections,
  ids: sectionIds
} as const

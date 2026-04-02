import type {
  RecordId
} from '@/core/contracts'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  Section,
  SectionKey
} from './types'

const emptyIds = [] as readonly AppearanceId[]

export const createAppearances = (input: {
  byId: ReadonlyMap<AppearanceId, Appearance>
  sections: readonly Section[]
}): AppearanceList => {
  const byId = new Map<AppearanceId, Appearance>()
  const ids: AppearanceId[] = []
  const visibleIndex = new Map<AppearanceId, number>()
  const sectionById = new Map<AppearanceId, SectionKey>()
  const idsBySection = new Map<SectionKey, readonly AppearanceId[]>()

  input.sections.forEach(section => {
    idsBySection.set(section.key, section.ids)

    section.ids.forEach(id => {
      const appearance = input.byId.get(id)
      if (!appearance) {
        return
      }

      byId.set(id, appearance)
      sectionById.set(id, section.key)
      if (!section.collapsed) {
        visibleIndex.set(id, ids.length)
        ids.push(id)
      }
    })
  })

  return {
    byId,
    ids,
    get: id => byId.get(id),
    has: id => visibleIndex.has(id),
    indexOf: id => visibleIndex.get(id),
    at: index => ids[index],
    prev: id => {
      const index = visibleIndex.get(id)
      return index === undefined || index <= 0
        ? undefined
        : ids[index - 1]
    },
    next: id => {
      const index = visibleIndex.get(id)
      return index === undefined || index >= ids.length - 1
        ? undefined
        : ids[index + 1]
    },
    range: (anchor, focus) => {
      const anchorIndex = visibleIndex.get(anchor)
      const focusIndex = visibleIndex.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    },
    sectionOf: id => sectionById.get(id),
    idsIn: section => idsBySection.get(section) ?? emptyIds
  }
}

export const recordIdsOfAppearances = (
  appearances: Pick<AppearanceList, 'get'>,
  ids: readonly AppearanceId[]
): readonly RecordId[] => {
  const seen = new Set<RecordId>()
  const next: RecordId[] = []

  ids.forEach(id => {
    const recordId = appearances.get(id)?.recordId
    if (!recordId || seen.has(recordId)) {
      return
    }

    seen.add(recordId)
    next.push(recordId)
  })

  return next
}

import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  SectionKey
} from './types'
import type {
  SectionState
} from './runtime/state'

const emptyIds = [] as readonly AppearanceId[]

const sameIds = (
  left: readonly string[],
  right: readonly string[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

export const createAppearanceId = (input: {
  section: SectionKey
  recordId: RecordId
}): AppearanceId => `section:${input.section}\u0000record:${input.recordId}`

export const createAppearanceList = (input: {
  byId: ReadonlyMap<AppearanceId, Appearance>
  ids: readonly AppearanceId[]
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
}): AppearanceList => {
  const visibleIndex = new Map<AppearanceId, number>()
  const sectionById = new Map<AppearanceId, SectionKey>()

  input.ids.forEach((id, index) => {
    visibleIndex.set(id, index)
  })

  input.idsBySection.forEach((ids, section) => {
    ids.forEach(id => {
      if (input.byId.has(id)) {
        sectionById.set(id, section)
      }
    })
  })

  return {
    byId: input.byId,
    ids: input.ids,
    get: id => input.byId.get(id),
    has: id => visibleIndex.has(id),
    indexOf: id => visibleIndex.get(id),
    at: index => input.ids[index],
    prev: id => {
      const index = visibleIndex.get(id)
      return index === undefined || index <= 0
        ? undefined
        : input.ids[index - 1]
    },
    next: id => {
      const index = visibleIndex.get(id)
      return index === undefined || index >= input.ids.length - 1
        ? undefined
        : input.ids[index + 1]
    },
    range: (anchor, focus) => {
      const anchorIndex = visibleIndex.get(anchor)
      const focusIndex = visibleIndex.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return input.ids.slice(start, end + 1)
    },
    sectionOf: id => sectionById.get(id),
    idsIn: section => input.idsBySection.get(section) ?? emptyIds
  }
}

export const buildAppearanceList = (
  sections: SectionState,
  previous?: AppearanceList,
  previousSections?: SectionState
): AppearanceList => {
  const byId = new Map<AppearanceId, Appearance>()
  const ids: AppearanceId[] = []
  const nextIdsBySection = new Map<SectionKey, readonly AppearanceId[]>()

  sections.order.forEach(sectionKey => {
    const section = sections.byKey.get(sectionKey)
    if (!section || !section.visible) {
      return
    }

    const canReuseSectionIds = (
      previous
      && previousSections?.byKey.get(sectionKey) === section
    )
    const previousSectionIds = canReuseSectionIds
      ? previous.idsIn(sectionKey)
      : undefined
    const sectionIds = previousSectionIds ?? section.ids.map(recordId => {
      const id = createAppearanceId({
        section: sectionKey,
        recordId
      })
      byId.set(
        id,
        previous?.get(id) ?? {
          id,
          recordId,
          section: sectionKey
        }
      )
      return id
    })

    if (previousSectionIds) {
      previousSectionIds.forEach(id => {
        const appearance = previous?.get(id)
        if (appearance) {
          byId.set(id, appearance)
        }
      })
    }

    nextIdsBySection.set(
      sectionKey,
      previousSectionIds && sameIds(previousSectionIds, sectionIds)
        ? previousSectionIds
        : sectionIds
    )
    if (!section.collapsed) {
      ids.push(...sectionIds)
    }
  })

  const publishedIds = previous && sameIds(previous.ids, ids)
    ? previous.ids
    : ids

  return createAppearanceList({
    byId,
    ids: publishedIds,
    idsBySection: nextIdsBySection
  })
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

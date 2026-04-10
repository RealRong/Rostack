import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  Section,
  SectionKey
} from './types'
import type {
  NavState,
  SectionState
} from './runtime/state'

const emptyIds = [] as readonly AppearanceId[]
const SEPARATOR = '\u0000'
const SECTION_PREFIX = 'section:'
const RECORD_PREFIX = 'record:'

const sameIds = (
  left: readonly string[],
  right: readonly string[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

export const createAppearanceId = (input: {
  section: SectionKey
  recordId: RecordId
}): AppearanceId => `section:${input.section}\u0000record:${input.recordId}`

const parseAppearanceId = (
  id: AppearanceId
): Appearance | undefined => {
  const split = id.indexOf(SEPARATOR)
  if (split < 0 || !id.startsWith(SECTION_PREFIX)) {
    return undefined
  }

  const section = id.slice(SECTION_PREFIX.length, split)
  const record = id.slice(split + SEPARATOR.length)
  if (!record.startsWith(RECORD_PREFIX)) {
    return undefined
  }

  return {
    id,
    section,
    recordId: record.slice(RECORD_PREFIX.length) as RecordId
  }
}

export const createAppearanceList = (input: {
  ids: readonly AppearanceId[]
  idsBySection: ReadonlyMap<SectionKey, readonly AppearanceId[]>
  count: number
  previous?: AppearanceList
}): AppearanceList => {
  let visibleIndex: ReadonlyMap<AppearanceId, number> | undefined
  let allIds: ReadonlySet<AppearanceId> | undefined
  const cache = new Map<AppearanceId, Appearance>()

  const ensureVisibleIndex = () => {
    if (visibleIndex) {
      return visibleIndex
    }

    visibleIndex = new Map(
      input.ids.map((id, index) => [id, index] as const)
    )
    return visibleIndex
  }

  const ensureAllIds = () => {
    if (allIds) {
      return allIds
    }

    const next = new Set<AppearanceId>()
    input.idsBySection.forEach((ids, section) => {
      ids.forEach(id => {
        if (parseAppearanceId(id)?.section === section) {
          next.add(id)
        }
      })
    })
    allIds = next
    return allIds
  }

  return {
    ids: input.ids,
    idsBySection: input.idsBySection,
    count: input.count,
    get: id => {
      const cached = cache.get(id)
      if (cached) {
        return cached
      }

      if (!ensureAllIds().has(id)) {
        return undefined
      }

      const parsed = parseAppearanceId(id)
      if (!parsed) {
        return undefined
      }

      const reused = input.previous?.get(id)
      const next = reused ?? parsed
      cache.set(id, next)
      return next
    },
    has: id => ensureVisibleIndex().has(id),
    indexOf: id => ensureVisibleIndex().get(id),
    at: index => input.ids[index],
    prev: id => {
      const index = ensureVisibleIndex().get(id)
      return index === undefined || index <= 0
        ? undefined
        : input.ids[index - 1]
    },
    next: id => {
      const index = ensureVisibleIndex().get(id)
      return index === undefined || index >= input.ids.length - 1
        ? undefined
        : input.ids[index + 1]
    },
    range: (anchor, focus) => {
      const index = ensureVisibleIndex()
      const anchorIndex = index.get(anchor)
      const focusIndex = index.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return input.ids.slice(start, end + 1)
    },
    sectionOf: id => {
      if (!ensureAllIds().has(id)) {
        return undefined
      }

      return parseAppearanceId(id)?.section
    },
    idsIn: section => input.idsBySection.get(section) ?? emptyIds
  }
}

export const buildAppearanceList = (
  sections: SectionState,
  previous?: AppearanceList,
  previousSections?: SectionState
): AppearanceList => {
  const ids: AppearanceId[] = []
  const nextIdsBySection = new Map<SectionKey, readonly AppearanceId[]>()
  let totalIdCount = 0

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
      return id
    })

    nextIdsBySection.set(
      sectionKey,
      previousSectionIds && sameIds(previousSectionIds, sectionIds)
        ? previousSectionIds
        : sectionIds
    )
    totalIdCount += sectionIds.length
    if (!section.collapsed) {
      ids.push(...sectionIds)
    }
  })

  const publishedIds = previous && sameIds(previous.ids, ids)
    ? previous.ids
    : ids
  const idsBySection = previous && previous.idsBySection.size === nextIdsBySection.size
    && Array.from(nextIdsBySection.entries()).every(([key, value]) => previous.idsBySection.get(key) === value)
    ? previous.idsBySection
    : nextIdsBySection

  if (
    previous
    && previous.ids === publishedIds
    && previous.idsBySection === idsBySection
    && previous.count === totalIdCount
  ) {
    return previous
  }

  return createAppearanceList({
    ids: publishedIds,
    idsBySection,
    count: totalIdCount,
    previous
  })
}

export const buildPublishedSections = (input: {
  sections: SectionState
  appearances: AppearanceList
  previous?: readonly Section[]
  previousSections?: SectionState
}): readonly Section[] => {
  const previousByKey = new Map(
    (input.previous ?? []).map(section => [section.key, section] as const)
  )
  const next: Section[] = []

  input.sections.order.forEach(key => {
    const node = input.sections.byKey.get(key)
    if (!node || !node.visible) {
      return
    }

    const ids = input.appearances.idsIn(node.key)
    const previousSection = previousByKey.get(node.key)
    const canReuse = previousSection
      && input.previousSections?.byKey.get(node.key) === node
      && previousSection.ids === ids

    next.push(canReuse
      ? previousSection
      : {
          key: node.key,
          title: node.title,
          color: node.color,
          bucket: node.bucket,
          ids,
          collapsed: node.collapsed
        })
  })

  return input.previous
    && input.previous.length === next.length
    && input.previous.every((section, index) => section === next[index])
    ? input.previous
    : next
}

export const buildNavState = (input: {
  sections: SectionState
  previous?: NavState
  previousSections?: SectionState
}): NavState => {
  const appearances = buildAppearanceList(
    input.sections,
    input.previous?.appearances,
    input.previousSections
  )
  const sections = buildPublishedSections({
    sections: input.sections,
    appearances,
    previous: input.previous?.sections,
    previousSections: input.previousSections
  })

  return input.previous
    && input.previous.appearances === appearances
    && input.previous.sections === sections
    ? input.previous
    : {
        appearances,
        sections
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

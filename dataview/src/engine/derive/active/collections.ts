import type {
  RecordId
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  Section,
  SectionList,
  SectionKey
} from '../readModels'
import type {
  SectionState
} from '../runtime/state'

const emptyIds = [] as readonly AppearanceId[]
const SEPARATOR = '\u0000'
const SECTION_PREFIX = 'section:'
const RECORD_PREFIX = 'record:'

export const createAppearanceId = (input: {
  sectionKey: SectionKey
  recordId: RecordId
}): AppearanceId => `section:${input.sectionKey}\u0000record:${input.recordId}`

const parseAppearanceId = (
  id: AppearanceId
): Appearance | undefined => {
  const split = id.indexOf(SEPARATOR)
  if (split < 0 || !id.startsWith(SECTION_PREFIX)) {
    return undefined
  }

  const sectionKey = id.slice(SECTION_PREFIX.length, split)
  const record = id.slice(split + SEPARATOR.length)
  if (!record.startsWith(RECORD_PREFIX)) {
    return undefined
  }

    return {
      id,
      sectionKey,
      recordId: record.slice(RECORD_PREFIX.length) as RecordId
    }
}

export const createAppearanceList = (input: {
  ids: readonly AppearanceId[]
  count: number
  previous?: AppearanceList
}): AppearanceList => {
  let visibleIndex: ReadonlyMap<AppearanceId, number> | undefined
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

  return {
    ids: input.ids,
    count: input.count,
    get: id => {
      const cached = cache.get(id)
      if (cached) {
        return cached
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
    }
  }
}

export const buildAppearanceList = (input: {
  sections: SectionState
  previous?: AppearanceList
  previousSections?: SectionState
}): AppearanceList => {
  const previous = input.previous
  const ids: AppearanceId[] = []
  let totalIdCount = 0

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section || !section.visible) {
      return
    }

    const canReuseSectionIds = (
      previous
      && input.previousSections?.byKey.get(sectionKey) === section
    )
    const previousSectionIds = canReuseSectionIds
      ? input.previousSections?.byKey.get(sectionKey)?.visible
        ? input.previous?.ids.filter(id => parseAppearanceId(id)?.sectionKey === sectionKey)
        : []
      : undefined
    const sectionIds = previousSectionIds ?? section.ids.map(recordId => createAppearanceId({
      sectionKey,
      recordId
    }))
    totalIdCount += sectionIds.length
    if (!section.collapsed) {
      ids.push(...sectionIds)
    }
  })

  const publishedIds = previous && sameOrder(previous.ids, ids)
    ? previous.ids
    : ids

  if (
    previous
    && previous.ids === publishedIds
    && previous.count === totalIdCount
  ) {
    return previous
  }

  return createAppearanceList({
    ids: publishedIds,
    count: totalIdCount,
    previous
  })
}

export const buildPublishedSections = (input: {
  sections: SectionState
  appearances: AppearanceList
  previous?: SectionList
  previousSections?: SectionState
}): SectionList => {
  const previous = input.previous
  const previousByKey = new Map(
    (previous?.all ?? []).map(section => [section.key, section] as const)
  )
  const sections: Section[] = []
  const byKey = new Map<SectionKey, Section>()
  const ids: SectionKey[] = []

  input.sections.order.forEach(key => {
    const node = input.sections.byKey.get(key)
    if (!node || !node.visible) {
      return
    }

    const appearanceIds = node.ids.map(recordId => createAppearanceId({
      sectionKey: node.key,
      recordId
    }))
    const previousSection = previousByKey.get(node.key)
    const canReuse = previousSection
      && input.previousSections?.byKey.get(node.key) === node
      && sameOrder(previousSection.appearanceIds, appearanceIds)
      && sameOrder(previousSection.recordIds, node.ids)

    const section = canReuse
      ? previousSection
      : {
          key: node.key,
          title: node.title,
          color: node.color,
          bucket: node.bucket,
          appearanceIds,
          recordIds: node.ids,
          collapsed: node.collapsed
        }
    sections.push(section)
    ids.push(section.key)
    byKey.set(section.key, section)
  })

  const publishedIds = previous && sameOrder(previous.ids, ids)
    ? previous.ids
    : ids
  const publishedSections = previous
    && previous.all.length === sections.length
    && previous.all.every((section, index) => section === sections[index])
    ? previous.all
    : sections

  if (
    previous
    && previous.ids === publishedIds
    && previous.all === publishedSections
  ) {
    return previous
  }

  return {
    ids: publishedIds,
    all: publishedSections,
    get: key => byKey.get(key),
    has: key => byKey.has(key),
    indexOf: key => publishedIds.indexOf(key),
    at: index => publishedIds[index]
  }
}

export const publishSectionsState = (input: {
  sections: SectionState
  previousSections?: SectionState
  previous?: {
    appearances?: AppearanceList
    sections?: SectionList
  }
}): {
  appearances: AppearanceList
  sections: SectionList
} => {
  const appearances = buildAppearanceList({
    sections: input.sections,
    previous: input.previous?.appearances,
    previousSections: input.previousSections
  })
  const sections = buildPublishedSections({
    sections: input.sections,
    appearances,
    previous: input.previous?.sections,
    previousSections: input.previousSections
  })

  return {
    appearances,
    sections
  }
}

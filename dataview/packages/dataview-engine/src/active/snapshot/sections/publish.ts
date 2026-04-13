import type { RecordId } from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import { createOrderedListAccess } from '#engine/active/snapshot/list.ts'
import type {
  ItemId,
  ItemList,
  Section,
  SectionKey,
  SectionList,
  ViewItem
} from '#engine/contracts/public.ts'
import type { SectionState } from '#engine/contracts/internal.ts'
const SEPARATOR = '\u0000'
const SECTION_PREFIX = 'section:'
const RECORD_PREFIX = 'record:'

export const createItemId = (input: {
  section: SectionKey
  recordId: RecordId
}): ItemId => `section:${input.section}\u0000record:${input.recordId}`

const parseItemId = (
  id: ItemId
): ViewItem | undefined => {
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
    sectionKey: section,
    recordId: record.slice(RECORD_PREFIX.length) as RecordId
  }
}

export const createItemList = (input: {
  ids: readonly ItemId[]
  count: number
  previous?: ItemList
}): ItemList => {
  const cache = new Map<ItemId, ViewItem>()
  const ordered = createOrderedListAccess(input.ids)

  return {
    ids: input.ids,
    count: input.count,
    get: id => {
      const cached = cache.get(id)
      if (cached) {
        return cached
      }

      const parsed = parseItemId(id)
      if (!parsed) {
        return undefined
      }

      const reused = input.previous?.get(id)
      const next = reused ?? parsed
      cache.set(id, next)
      return next
    },
    has: ordered.has,
    indexOf: ordered.indexOf,
    at: ordered.at,
    prev: ordered.prev,
    next: ordered.next,
    range: ordered.range
  }
}

export const buildItemList = (input: {
  sections: SectionState
  previous?: ItemList
  previousSections?: SectionState
}): ItemList => {
  const previous = input.previous
  const ids: ItemId[] = []
  let totalIdCount = 0

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section || !section.visible) {
      return
    }

    totalIdCount += section.itemIds.length
    if (!section.collapsed) {
      ids.push(...section.itemIds)
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

  return createItemList({
    ids: publishedIds,
    count: totalIdCount,
    previous
  })
}

export const buildSections = (input: {
  sections: SectionState
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

    const itemIds = node.itemIds
    const previousSection = previousByKey.get(node.key)
    const canReuse = Boolean(
      previousSection
      && input.previousSections?.byKey.get(node.key) === node
      && sameOrder(previousSection.itemIds, itemIds)
      && sameOrder(previousSection.recordIds, node.recordIds)
    )

    const section: Section = canReuse && previousSection
      ? previousSection
      : {
          key: node.key,
          title: node.title,
          color: node.color,
          bucket: node.bucket,
          itemIds,
          recordIds: node.recordIds,
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
  const ordered = createOrderedListAccess(publishedIds)

  if (
    previous
    && previous.ids === publishedIds
    && previous.all === publishedSections
  ) {
    return previous
  }

  const publishedByKey = previous
    && previous.ids === publishedIds
    && previous.all === publishedSections
      ? new Map(publishedSections.map(section => [section.key, section] as const))
      : byKey

  return {
    ids: publishedIds,
    all: publishedSections,
    get: key => publishedByKey.get(key),
    has: ordered.has,
    indexOf: ordered.indexOf,
    at: ordered.at
  }
}

export const publishSections = (input: {
  sections: SectionState
  previousSections?: SectionState
  previous?: {
    items?: ItemList
    sections?: SectionList
  }
}): {
  items: ItemList
  sections: SectionList
} => {
  const items = buildItemList({
    sections: input.sections,
    previous: input.previous?.items,
    previousSections: input.previousSections
  })
  const sections = buildSections({
    sections: input.sections,
    previous: input.previous?.sections,
    previousSections: input.previousSections
  })

  return {
    items,
    sections
  }
}

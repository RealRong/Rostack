import type { RecordId } from '@dataview/core/contracts'
import { sameOrder } from '@shared/core'
import {
  createOrderedKeyedListAccess,
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'
import type {
  ItemId,
  ItemList,
  Section,
  SectionKey,
  SectionList,
  ViewItem
} from '@dataview/engine/contracts/public'
import type { SectionState } from '@dataview/engine/contracts/internal'
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
  const items = createOrderedKeyedListAccess({
    ids: input.ids,
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
    }
  })

  return {
    ...items,
    count: input.count
  }
}

const createSectionItemList = (input: {
  sectionKey: SectionKey
  recordIds: readonly RecordId[]
  previous?: ItemList
}): ItemList => {
  let ids: readonly ItemId[] | undefined
  let indexByRecordId: ReadonlyMap<RecordId, number> | undefined
  const cache = new Map<ItemId, ViewItem>()
  const ensureIds = () => {
    if (ids) {
      return ids
    }

    const nextIds = new Array<ItemId>(input.recordIds.length)
    for (let index = 0; index < input.recordIds.length; index += 1) {
      nextIds[index] = createItemId({
        section: input.sectionKey,
        recordId: input.recordIds[index]!
      })
    }
    ids = nextIds
    return ids
  }
  const ensureIndexByRecordId = () => {
    if (indexByRecordId) {
      return indexByRecordId
    }

    const nextIndexByRecordId = new Map<RecordId, number>()
    for (let index = 0; index < input.recordIds.length; index += 1) {
      nextIndexByRecordId.set(input.recordIds[index]!, index)
    }
    indexByRecordId = nextIndexByRecordId
    return indexByRecordId
  }
  const resolveItem = (id: ItemId) => {
    const cached = cache.get(id)
    if (cached) {
      return cached
    }

    const parsed = parseItemId(id)
    if (!parsed || parsed.sectionKey !== input.sectionKey) {
      return undefined
    }

    const index = ensureIndexByRecordId().get(parsed.recordId)
    if (index === undefined) {
      return undefined
    }

    const canonicalId = ensureIds()[index] ?? id
    const reused = input.previous?.get(canonicalId)
    const next = reused ?? {
      id: canonicalId,
      sectionKey: input.sectionKey,
      recordId: parsed.recordId
    }
    cache.set(canonicalId, next)
    if (canonicalId !== id) {
      cache.set(id, next)
    }
    return next
  }
  const indexOf = (id: ItemId) => {
    const parsed = parseItemId(id)
    if (!parsed || parsed.sectionKey !== input.sectionKey) {
      return undefined
    }

    return ensureIndexByRecordId().get(parsed.recordId)
  }

  return {
    get ids() {
      return ensureIds()
    },
    count: input.recordIds.length,
    get: resolveItem,
    has: id => indexOf(id) !== undefined,
    indexOf,
    at: index => ensureIds()[index],
    prev: id => {
      const currentIndex = indexOf(id)
      return currentIndex === undefined || currentIndex <= 0
        ? undefined
        : ensureIds()[currentIndex - 1]
    },
    next: id => {
      const currentIndex = indexOf(id)
      return currentIndex === undefined || currentIndex >= input.recordIds.length - 1
        ? undefined
        : ensureIds()[currentIndex + 1]
    },
    range: (anchor, focus) => {
      const anchorIndex = indexOf(anchor)
      const focusIndex = indexOf(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return []
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ensureIds().slice(start, end + 1)
    }
  }
}

export const buildItemList = (input: {
  sections: SectionList
  previous?: ItemList
}): ItemList => {
  const previous = input.previous
  let totalIdCount = 0
  let visibleIdCount = 0

  for (const section of input.sections.all) {
    const count = section.items.count
    totalIdCount += count
    if (!section.collapsed) {
      visibleIdCount += count
    }
  }

  const ids = new Array<ItemId>(visibleIdCount)
  let writeIndex = 0

  for (const section of input.sections.all) {
    if (section.collapsed) {
      continue
    }

    for (const id of section.items.ids) {
      ids[writeIndex] = id
      writeIndex += 1
    }
  }

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

    const previousSection = previousByKey.get(node.key)
    const items = previousSection && previousSection.recordIds === node.recordIds
      ? previousSection.items
      : createSectionItemList({
          sectionKey: node.key,
          recordIds: node.recordIds,
          previous: previousSection?.items
        })
    const canReuse = Boolean(
      previousSection
      && input.previousSections?.byKey.get(node.key) === node
      && previousSection.items === items
    )

    const section: Section = canReuse && previousSection
      ? previousSection
      : {
          key: node.key,
          title: node.title,
          color: node.color,
          bucket: node.bucket,
          recordIds: node.recordIds,
          items,
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
  const publishedByKey = previous
    && previous.ids === publishedIds
    && previous.all === publishedSections
      ? new Map(publishedSections.map(section => [section.key, section] as const))
      : byKey
  const sectionList = createOrderedKeyedListCollection({
    ids: publishedIds,
    all: publishedSections,
    get: key => publishedByKey.get(key)
  })

  if (
    previous
    && previous.ids === publishedIds
    && previous.all === publishedSections
  ) {
    return previous
  }

  return {
    ids: sectionList.ids,
    all: sectionList.all,
    get: sectionList.get,
    has: sectionList.has,
    indexOf: sectionList.indexOf,
    at: sectionList.at
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
  const sections = buildSections({
    sections: input.sections,
    previous: input.previous?.sections,
    previousSections: input.previousSections
  })
  const items = buildItemList({
    sections,
    previous: input.previous?.items
  })

  return {
    items,
    sections
  }
}

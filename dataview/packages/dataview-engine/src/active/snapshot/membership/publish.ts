import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import {
  ROOT_SECTION_KEY,
  EMPTY_SECTION_KEYS
} from '@dataview/engine/active/shared/sections'
import {
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'
import {
  createMapPatchBuilder,
  type MapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  createSectionRecordKey,
  type ItemProjectionCache
} from '@dataview/engine/active/shared/itemIdentity'
import type {
  ItemId,
  ItemList,
  Section,
  SectionKey,
  SectionList,
  ViewItem
} from '@dataview/engine/contracts'
import type {
  SectionState
} from '@dataview/engine/contracts/state'

const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_ITEMS_BY_ID = new Map<ItemId, ViewItem>()
const EMPTY_SECTION_RECORD_ITEMS = new Map<string, ItemId>()

const sectionVisible = (input: {
  view: View
  sectionKey: SectionKey
  recordIds: readonly RecordId[]
}) => {
  const group = input.view.group
  if (!group) {
    return true
  }

  if (group.buckets?.[input.sectionKey]?.hidden === true) {
    return false
  }

  return group.showEmpty !== false || input.recordIds.length > 0
}

const sectionCollapsed = (
  view: View,
  sectionKey: SectionKey
) => view.group?.buckets?.[sectionKey]?.collapsed === true

const createItemList = (input: {
  ids: readonly ItemId[]
  byId: ReadonlyMap<ItemId, ViewItem>
  previous?: ItemList
}): ItemList => {
  if (
    input.previous
    && input.previous.ids === input.ids
    && input.previous.count === input.ids.length
    && input.ids.every(id => input.previous!.get(id) === input.byId.get(id))
  ) {
    return input.previous
  }

  let indexById: ReadonlyMap<ItemId, number> | undefined
  const ensureIndexById = () => {
    if (indexById) {
      return indexById
    }

    const next = new Map<ItemId, number>()
    for (let index = 0; index < input.ids.length; index += 1) {
      next.set(input.ids[index]!, index)
    }
    indexById = next
    return indexById
  }

  return {
    ids: input.ids,
    count: input.ids.length,
    get: id => input.byId.get(id),
    has: id => ensureIndexById().has(id),
    at: index => input.ids[index],
    indexOf: id => ensureIndexById().get(id),
    prev: id => {
      const index = ensureIndexById().get(id)
      return index === undefined || index <= 0
        ? undefined
        : input.ids[index - 1]
    },
    next: id => {
      const index = ensureIndexById().get(id)
      return index === undefined || index >= input.ids.length - 1
        ? undefined
        : input.ids[index + 1]
    },
    range: (anchor, focus) => {
      const anchorIndex = ensureIndexById().get(anchor)
      const focusIndex = ensureIndexById().get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return EMPTY_ITEM_IDS
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return input.ids.slice(start, end + 1)
    }
  }
}

const projectSectionItemIds = (input: {
  sectionKey: SectionKey
  recordIds: readonly RecordId[]
  bySectionRecord: ReadonlyMap<string, ItemId>
}): readonly ItemId[] => {
  if (!input.recordIds.length) {
    return EMPTY_ITEM_IDS
  }

  const ids = new Array<ItemId>(input.recordIds.length)

  for (let index = 0; index < input.recordIds.length; index += 1) {
    const recordId = input.recordIds[index]!
    const itemId = input.bySectionRecord.get(
      createSectionRecordKey(input.sectionKey, recordId)
    )
    if (itemId === undefined) {
      throw new Error(
        `Missing item projection for section "${input.sectionKey}" and record "${recordId}".`
      )
    }

    ids[index] = itemId
  }

  return ids
}

const buildSections = (input: {
  view: View
  sections: SectionState
  previous?: SectionList
  previousSections?: SectionState
  byId: ReadonlyMap<ItemId, ViewItem>
  bySectionRecord: ReadonlyMap<string, ItemId>
}): SectionList => {
  const previous = input.previous
  const sections: Section[] = []
  const byKey = new Map<SectionKey, Section>()
  const ids: SectionKey[] = []

  input.sections.order.forEach(key => {
    const node = input.sections.byKey.get(key)
    if (!node || !sectionVisible({
      view: input.view,
      sectionKey: key,
      recordIds: node.recordIds
    })) {
      return
    }

    const nextItemIds = projectSectionItemIds({
      sectionKey: node.key,
      recordIds: node.recordIds,
      bySectionRecord: input.bySectionRecord
    })
    const previousSection = previous?.get(node.key)
    const publishedItemIds = previousSection && equal.sameOrder(previousSection.items.ids, nextItemIds)
      ? previousSection.items.ids
      : nextItemIds
    const items = createItemList({
      ids: publishedItemIds,
      byId: input.byId,
      previous: previousSection?.items
    })
    const collapsed = sectionCollapsed(input.view, node.key)
    const canReuse = Boolean(
      previousSection
      && input.previousSections?.byKey.get(node.key) === node
      && previousSection.items === items
      && previousSection.collapsed === collapsed
    )

    const section: Section = canReuse && previousSection
      ? previousSection
      : {
          key: node.key,
          label: node.label,
          color: node.color,
          bucket: node.bucket,
          recordIds: node.recordIds,
          items,
          collapsed
        }
    sections.push(section)
    ids.push(section.key)
    byKey.set(section.key, section)
  })

  const publishedIds = previous && equal.sameOrder(previous.ids, ids)
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

  const sectionList = createOrderedKeyedListCollection({
    ids: publishedIds,
    all: publishedSections,
    get: key => byKey.get(key)
  })

  return {
    ids: sectionList.ids,
    all: sectionList.all,
    get: sectionList.get,
    has: sectionList.has,
    indexOf: sectionList.indexOf,
    at: sectionList.at
  }
}

const buildItemList = (input: {
  sections: SectionList
  byId: ReadonlyMap<ItemId, ViewItem>
  previous?: ItemList
  previousSections?: SectionList
}): ItemList => {
  if (input.previous && input.sections === input.previousSections) {
    return input.previous
  }

  let visibleIdCount = 0
  let singleVisibleSection: Section | undefined

  for (const section of input.sections.all) {
    if (section.collapsed) {
      continue
    }

    visibleIdCount += section.items.ids.length
    singleVisibleSection = singleVisibleSection
      ? undefined
      : section
  }

  if (
    singleVisibleSection
    && visibleIdCount === singleVisibleSection.items.ids.length
  ) {
    return singleVisibleSection.items
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

  const previousIds = input.previous?.ids
  const publishedIds = previousIds && equal.sameOrder(previousIds, ids)
    ? previousIds
    : ids

  return createItemList({
    ids: publishedIds,
    byId: input.byId,
    previous: input.previous
  })
}

const syncProjectionEntry = (input: {
  previous?: ItemProjectionCache
  sectionKey: SectionKey
  recordId: RecordId
  nextId: number
  byId: MapPatchBuilder<ItemId, ViewItem>
  bySectionRecord: MapPatchBuilder<string, ItemId>
}): number => {
  const projectionKey = createSectionRecordKey(input.sectionKey, input.recordId)
  const reusedId = input.previous?.bySectionRecord.get(projectionKey)
  const itemId = reusedId ?? input.nextId
  const previousItem = input.previous?.byId.get(itemId)
  const nextItem = (
    previousItem
    && previousItem.recordId === input.recordId
    && previousItem.sectionKey === input.sectionKey
      ? previousItem
      : {
          id: itemId,
          recordId: input.recordId,
          sectionKey: input.sectionKey
        }
  )

  if (reusedId === undefined) {
    input.bySectionRecord.set(projectionKey, itemId)
  }
  if (nextItem !== previousItem) {
    input.byId.set(itemId, nextItem)
  }

  return reusedId === undefined
    ? input.nextId + 1
    : input.nextId
}

const removeDeletedProjectionEntries = (input: {
  previous?: ItemProjectionCache
  seenKeys: ReadonlySet<string>
  byId: MapPatchBuilder<ItemId, ViewItem>
  bySectionRecord: MapPatchBuilder<string, ItemId>
}) => {
  input.previous?.bySectionRecord.forEach((itemId, projectionKey) => {
    if (input.seenKeys.has(projectionKey)) {
      return
    }

    input.bySectionRecord.delete(projectionKey)
    input.byId.delete(itemId)
  })
}

const finishProjection = (input: {
  mode: 'root' | 'grouped'
  previous?: ItemProjectionCache
  nextId: number
  byId: MapPatchBuilder<ItemId, ViewItem>
  bySectionRecord: MapPatchBuilder<string, ItemId>
}): ItemProjectionCache => {
  if (
    input.previous
    && input.previous.mode === input.mode
    && input.previous.nextId === input.nextId
    && !input.byId.changed()
    && !input.bySectionRecord.changed()
  ) {
    return input.previous
  }

  return {
    mode: input.mode,
    nextId: input.nextId,
    byId: input.byId.finish(),
    bySectionRecord: input.bySectionRecord.finish()
  }
}

const syncRootProjection = (input: {
  previous?: ItemProjectionCache
  allRecordIds: readonly RecordId[]
}): ItemProjectionCache => {
  const previous = input.previous?.mode === 'root'
    ? input.previous
    : undefined
  const byId = createMapPatchBuilder(previous?.byId ?? EMPTY_ITEMS_BY_ID)
  const bySectionRecord = createMapPatchBuilder(previous?.bySectionRecord ?? EMPTY_SECTION_RECORD_ITEMS)
  const seenKeys = new Set<string>()
  let nextId = previous?.nextId ?? 1

  for (let index = 0; index < input.allRecordIds.length; index += 1) {
    const recordId = input.allRecordIds[index]!
    seenKeys.add(createSectionRecordKey(ROOT_SECTION_KEY, recordId))
    nextId = syncProjectionEntry({
      previous,
      sectionKey: ROOT_SECTION_KEY,
      recordId,
      nextId,
      byId,
      bySectionRecord
    })
  }

  removeDeletedProjectionEntries({
    previous,
    seenKeys,
    byId,
    bySectionRecord
  })

  return finishProjection({
    mode: 'root',
    previous,
    nextId,
    byId,
    bySectionRecord
  })
}

const syncGroupedProjection = (input: {
  previous?: ItemProjectionCache
  allRecordIds: readonly RecordId[]
  sectionKeysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}): ItemProjectionCache => {
  const previous = input.previous?.mode === 'grouped'
    ? input.previous
    : undefined
  const byId = createMapPatchBuilder(previous?.byId ?? EMPTY_ITEMS_BY_ID)
  const bySectionRecord = createMapPatchBuilder(previous?.bySectionRecord ?? EMPTY_SECTION_RECORD_ITEMS)
  const seenKeys = new Set<string>()
  let nextId = previous?.nextId ?? 1

  for (let index = 0; index < input.allRecordIds.length; index += 1) {
    const recordId = input.allRecordIds[index]!
    const sectionKeys = input.sectionKeysByRecord.get(recordId) ?? EMPTY_SECTION_KEYS

    for (let keyIndex = 0; keyIndex < sectionKeys.length; keyIndex += 1) {
      const sectionKey = sectionKeys[keyIndex]!
      seenKeys.add(createSectionRecordKey(sectionKey, recordId))
      nextId = syncProjectionEntry({
        previous,
        sectionKey,
        recordId,
        nextId,
        byId,
        bySectionRecord
      })
    }
  }

  removeDeletedProjectionEntries({
    previous,
    seenKeys,
    byId,
    bySectionRecord
  })

  return finishProjection({
    mode: 'grouped',
    previous,
    nextId,
    byId,
    bySectionRecord
  })
}

export const syncItemProjection = (input: {
  mode: 'root' | 'grouped'
  previous?: ItemProjectionCache
  allRecordIds: readonly RecordId[]
  sectionKeysByRecord?: ReadonlyMap<RecordId, readonly SectionKey[]>
}): ItemProjectionCache => input.mode === 'root'
  ? syncRootProjection({
      previous: input.previous,
      allRecordIds: input.allRecordIds
    })
  : syncGroupedProjection({
      previous: input.previous,
      allRecordIds: input.allRecordIds,
      sectionKeysByRecord: input.sectionKeysByRecord ?? new Map()
    })

export const publishSections = (input: {
  view: View
  sections: SectionState
  projection: ItemProjectionCache
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
    view: input.view,
    sections: input.sections,
    previous: input.previous?.sections,
    previousSections: input.previousSections,
    byId: input.projection.byId,
    bySectionRecord: input.projection.bySectionRecord
  })
  const items = buildItemList({
    sections,
    byId: input.projection.byId,
    previous: input.previous?.items,
    previousSections: input.previous?.sections
  })

  return {
    items,
    sections
  }
}

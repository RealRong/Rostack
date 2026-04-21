import type {
  RecordId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import {
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'
import {
  createMapPatchBuilder,
  type MapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  type GroupedItemProjection,
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
const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_RECORD_ITEM_IDS = new Map<RecordId, ItemId>()
const EMPTY_GROUPED_PROJECTION = new Map<SectionKey, GroupedItemProjection>()
const EMPTY_ROOT_PROJECTION = new Map<RecordId, ItemId>()
const LARGE_SECTION_MAPPING_DELTA = 128

const shouldRebuildSectionMapping = (
  previousSize: number,
  nextSize: number
) => {
  const delta = Math.abs(previousSize - nextSize)
  return delta >= LARGE_SECTION_MAPPING_DELTA
    && (
      previousSize >= nextSize * 2
      || nextSize >= previousSize * 2
    )
}

const createItemList = (input: {
  ids: readonly ItemId[]
  count: number
  byId: ReadonlyMap<ItemId, ViewItem>
  previous?: ItemList
}): ItemList => {
  if (
    input.previous
    && input.previous.ids === input.ids
    && input.previous.count === input.count
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
    count: input.count,
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

const buildSections = (input: {
  sections: SectionState
  previous?: SectionList
  previousSections?: SectionState
  byId: ReadonlyMap<ItemId, ViewItem>
  visibleIdsBySection: ReadonlyMap<SectionKey, readonly ItemId[]>
}): SectionList => {
  const previous = input.previous
  const sections: Section[] = []
  const byKey = new Map<SectionKey, Section>()
  const ids: SectionKey[] = []

  input.sections.order.forEach(key => {
    const node = input.sections.byKey.get(key)
    if (!node || !node.visible) {
      return
    }

    const nextItemIds = input.visibleIdsBySection.get(node.key) ?? EMPTY_ITEM_IDS
    const previousSection = previous?.get(node.key)
    const publishedItemIds = previousSection && equal.sameOrder(previousSection.items.ids, nextItemIds)
      ? previousSection.items.ids
      : nextItemIds
    const items = createItemList({
      ids: publishedItemIds,
      count: node.recordIds.length,
      byId: input.byId,
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
          label: node.label,
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

  let totalIdCount = 0
  let visibleIdCount = 0
  let singleVisibleSection: Section | undefined

  for (const section of input.sections.all) {
    const count = section.items.count
    totalIdCount += count
    if (section.collapsed) {
      continue
    }

    visibleIdCount += count
    singleVisibleSection = singleVisibleSection
      ? undefined
      : section
  }

  if (
    singleVisibleSection
    && totalIdCount === singleVisibleSection.items.count
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
    count: totalIdCount,
    byId: input.byId,
    previous: input.previous
  })
}

const projectVisibleIds = (
  recordIds: readonly RecordId[],
  byRecord: ReadonlyMap<RecordId, ItemId>
): readonly ItemId[] => {
  if (!recordIds.length) {
    return EMPTY_ITEM_IDS
  }

  const ids = new Array<ItemId>(recordIds.length)
  let writeIndex = 0

  for (let index = 0; index < recordIds.length; index += 1) {
    const itemId = byRecord.get(recordIds[index]!)
    if (itemId === undefined) {
      continue
    }

    ids[writeIndex] = itemId
    writeIndex += 1
  }

  return writeIndex === ids.length
    ? ids
    : ids.slice(0, writeIndex)
}

const rebuildGroupedSectionProjection = (input: {
  sectionKey: SectionKey
  recordIds: readonly RecordId[]
  previous?: GroupedItemProjection
  byId: MapPatchBuilder<ItemId, ViewItem>
  nextId: number
}): {
  projection: GroupedItemProjection
  nextId: number
} => {
  const ids = new Array<ItemId>(input.recordIds.length)
  const byRecord = new Map<RecordId, ItemId>()
  let nextId = input.nextId
  let idsChanged = !input.previous || input.previous.ids.length !== input.recordIds.length
  let mappingChanged = (input.previous?.byRecord.size ?? 0) !== input.recordIds.length

  for (let index = 0; index < input.recordIds.length; index += 1) {
    const recordId = input.recordIds[index]!
    const reusedId = input.previous?.byRecord.get(recordId)
    const itemId = reusedId ?? nextId++
    ids[index] = itemId
    byRecord.set(recordId, itemId)

    if (!idsChanged && input.previous!.ids[index] !== itemId) {
      idsChanged = true
    }
    if (!mappingChanged && reusedId === undefined) {
      mappingChanged = true
    }
    if (reusedId === undefined) {
      input.byId.set(itemId, {
        id: itemId,
        sectionKey: input.sectionKey,
        recordId
      })
    }
  }

  input.previous?.byRecord.forEach((itemId, recordId) => {
    if (byRecord.has(recordId)) {
      return
    }

    mappingChanged = true
    input.byId.delete(itemId)
  })

  return {
    projection: {
      ids: idsChanged
        ? ids
        : input.previous?.ids ?? ids,
      byRecord: mappingChanged
        ? byRecord
        : input.previous?.byRecord ?? EMPTY_RECORD_ITEM_IDS
    },
    nextId
  }
}

const syncGroupedSectionProjection = (input: {
  sectionKey: SectionKey
  recordIds: readonly RecordId[]
  previous?: GroupedItemProjection
  byId: MapPatchBuilder<ItemId, ViewItem>
  nextId: number
}): {
  projection: GroupedItemProjection
  nextId: number
} => {
  const previous = input.previous
  if (
    previous
    && previous.ids.length === input.recordIds.length
    && input.recordIds.every(recordId => previous.byRecord.has(recordId))
  ) {
    const ids = projectVisibleIds(input.recordIds, previous.byRecord)
    return {
      projection: {
        ids: equal.sameOrder(ids, previous.ids)
          ? previous.ids
          : ids,
        byRecord: previous.byRecord
      },
      nextId: input.nextId
    }
  }

  const previousSize = previous?.byRecord.size ?? 0
  const nextSize = input.recordIds.length
  if (shouldRebuildSectionMapping(previousSize, nextSize)) {
    return rebuildGroupedSectionProjection(input)
  }

  const ids = new Array<ItemId>(nextSize)
  let nextId = input.nextId
  const byRecord = createMapPatchBuilder(previous?.byRecord ?? EMPTY_RECORD_ITEM_IDS)
  const seenRecords = previousSize
    ? new Set<RecordId>()
    : undefined
  let idsChanged = !previous || previous.ids.length !== nextSize
  let mappingChanged = previousSize !== nextSize

  for (let index = 0; index < nextSize; index += 1) {
    const recordId = input.recordIds[index]!
    const reusedId = previous?.byRecord.get(recordId)
    const itemId = reusedId ?? nextId++
    ids[index] = itemId
    seenRecords?.add(recordId)

    if (!idsChanged && previous!.ids[index] !== itemId) {
      idsChanged = true
    }
    if (!mappingChanged && reusedId === undefined) {
      mappingChanged = true
    }
    if (reusedId === undefined) {
      byRecord.set(recordId, itemId)
      input.byId.set(itemId, {
        id: itemId,
        sectionKey: input.sectionKey,
        recordId
      })
    }
  }

  previous?.byRecord.forEach((itemId, recordId) => {
    if (seenRecords?.has(recordId)) {
      return
    }

    mappingChanged = true
    byRecord.delete(recordId)
    input.byId.delete(itemId)
  })

  return {
    projection: {
      ids: idsChanged
        ? ids
        : previous?.ids ?? ids,
      byRecord: mappingChanged
        ? byRecord.finish()
        : previous?.byRecord ?? EMPTY_RECORD_ITEM_IDS
    },
    nextId
  }
}

const removeGroupedItemsFromById = (
  target: MapPatchBuilder<ItemId, ViewItem>,
  grouped: ReadonlyMap<SectionKey, GroupedItemProjection>
) => {
  grouped.forEach(section => {
    section.byRecord.forEach(itemId => {
      target.delete(itemId)
    })
  })
}

const removeRootItemsFromById = (
  target: MapPatchBuilder<ItemId, ViewItem>,
  rootByRecord: ReadonlyMap<RecordId, ItemId>
) => {
  rootByRecord.forEach(itemId => {
    target.delete(itemId)
  })
}

const syncRootProjection = (input: {
  previous?: ItemProjectionCache
  allRecordIds: readonly RecordId[]
}): ItemProjectionCache => {
  const previous = input.previous
  const byId = createMapPatchBuilder(previous?.byId ?? new Map<ItemId, ViewItem>())
  if (previous?.grouped.size) {
    removeGroupedItemsFromById(byId, previous.grouped)
  }

  const previousRoot = previous?.rootByRecord ?? EMPTY_ROOT_PROJECTION
  const rootByRecord = createMapPatchBuilder(previousRoot)
  let nextId = previous?.nextId ?? 1
  let rootChanged = false
  const currentIds = new Set(input.allRecordIds)

  previousRoot.forEach((itemId, recordId) => {
    if (currentIds.has(recordId)) {
      return
    }

    rootChanged = true
    rootByRecord.delete(recordId)
    byId.delete(itemId)
  })

  for (let index = 0; index < input.allRecordIds.length; index += 1) {
    const recordId = input.allRecordIds[index]!
    if (previousRoot.has(recordId)) {
      continue
    }

    rootChanged = true
    const itemId = nextId++
    rootByRecord.set(recordId, itemId)
    byId.set(itemId, {
      id: itemId,
      sectionKey: 'root' as SectionKey,
      recordId
    })
  }

  return {
    nextId,
    byId: byId.finish(),
    rootByRecord: rootChanged
      ? rootByRecord.finish()
      : previousRoot,
    grouped: EMPTY_GROUPED_PROJECTION
  }
}

const syncGroupedProjection = (input: {
  sections: SectionState
  previous?: ItemProjectionCache
  sectionMembership: ReadonlyMap<SectionKey, readonly RecordId[]>
  changedSectionKeys: readonly SectionKey[]
  removedSectionKeys: readonly SectionKey[]
  rebuild: boolean
}): ItemProjectionCache => {
  const previous = input.previous
  const mustRebuildAll = (
    input.rebuild
    || !previous
    || previous.rootByRecord.size > 0
  )
  const byId = createMapPatchBuilder(previous?.byId ?? new Map<ItemId, ViewItem>())
  if (previous?.rootByRecord.size) {
    removeRootItemsFromById(byId, previous.rootByRecord)
  }

  const grouped = createMapPatchBuilder(previous?.grouped ?? EMPTY_GROUPED_PROJECTION)
  let nextId = previous?.nextId ?? 1

  const syncKeys = mustRebuildAll
    ? input.sections.order.filter(sectionKey => input.sections.byKey.has(sectionKey))
    : [...new Set([
        ...input.changedSectionKeys,
        ...input.removedSectionKeys
      ])]

  if (mustRebuildAll) {
    previous?.grouped.forEach((projection, sectionKey) => {
      if (input.sections.byKey.has(sectionKey)) {
        return
      }

      projection.byRecord.forEach(itemId => {
        byId.delete(itemId)
      })
      grouped.delete(sectionKey)
    })
  }

  input.removedSectionKeys.forEach(sectionKey => {
    if (mustRebuildAll) {
      return
    }

    const previousProjection = previous?.grouped.get(sectionKey)
    previousProjection?.byRecord.forEach(itemId => {
      byId.delete(itemId)
    })
    grouped.delete(sectionKey)
  })

  syncKeys.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const projection = syncGroupedSectionProjection({
      sectionKey,
      recordIds: input.sectionMembership.get(sectionKey) ?? EMPTY_RECORD_IDS,
      previous: previous?.grouped.get(sectionKey),
      byId,
      nextId
    })
    nextId = projection.nextId

    const previousProjection = previous?.grouped.get(sectionKey)
    if (
      !previousProjection
      || projection.projection.ids !== previousProjection.ids
      || projection.projection.byRecord !== previousProjection.byRecord
    ) {
      grouped.set(sectionKey, projection.projection)
    }
  })

  return {
    nextId,
    byId: byId.finish(),
    rootByRecord: EMPTY_ROOT_PROJECTION,
    grouped: grouped.finish()
  }
}

export const syncSectionProjection = (input: {
  mode: 'root' | 'grouped'
  sections: SectionState
  previous?: ItemProjectionCache
  allRecordIds: readonly RecordId[]
  sectionMembership?: ReadonlyMap<SectionKey, readonly RecordId[]>
  changedSectionKeys?: readonly SectionKey[]
  removedSectionKeys?: readonly SectionKey[]
  rebuild: boolean
}): ItemProjectionCache => input.mode === 'root'
  ? syncRootProjection({
      previous: input.previous,
      allRecordIds: input.allRecordIds
    })
  : syncGroupedProjection({
      sections: input.sections,
      previous: input.previous,
      sectionMembership: input.sectionMembership ?? new Map(),
      changedSectionKeys: input.changedSectionKeys ?? [],
      removedSectionKeys: input.removedSectionKeys ?? [],
      rebuild: input.rebuild
    })

export const publishSections = (input: {
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
  const visibleIdsBySection = new Map<SectionKey, readonly ItemId[]>()

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const byRecord = input.projection.rootByRecord.size
      ? input.projection.rootByRecord
      : input.projection.grouped.get(sectionKey)?.byRecord ?? EMPTY_RECORD_ITEM_IDS
    visibleIdsBySection.set(
      sectionKey,
      projectVisibleIds(section.recordIds, byRecord)
    )
  })

  const sections = buildSections({
    sections: input.sections,
    previous: input.previous?.sections,
    previousSections: input.previousSections,
    byId: input.projection.byId,
    visibleIdsBySection
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

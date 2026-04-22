import { collection, equal } from '@shared/core'
import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import type {
  CollectionDelta
} from '@dataview/engine/contracts/delta'
import type {
  ItemId,
  ItemIdPool,
  ItemList,
  ItemPlacement,
  Section,
  SectionKey,
  SectionList
} from '@dataview/engine/contracts'
import type {
  MembershipState
} from '@dataview/engine/contracts/state'

const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_ITEM_PLACEMENTS = new Map<ItemId, ItemPlacement>()
const EMPTY_ITEM_RECORDS = new Map<ItemId, RecordId>()
const EMPTY_ITEM_SECTIONS = new Map<ItemId, SectionKey>()
const ITEM_RECORDS_CACHE = new WeakMap<ItemList, ReadonlyMap<ItemId, RecordId>>()
const ITEM_SECTIONS_CACHE = new WeakMap<ItemList, ReadonlyMap<ItemId, SectionKey>>()
const ITEM_PLACEMENTS_CACHE = new WeakMap<ItemList, ReadonlyMap<ItemId, ItemPlacement>>()

const createCollectionDelta = <Key,>(input: {
  list?: boolean
  update?: readonly Key[]
  remove?: readonly Key[]
}): CollectionDelta<Key> | undefined => (
  input.list || input.update?.length || input.remove?.length
    ? {
        ...(input.list
          ? {
              list: true as const
            }
          : {}),
        ...(input.update?.length
          ? {
              update: input.update
            }
          : {}),
        ...(input.remove?.length
          ? {
              remove: input.remove
            }
          : {})
      }
    : undefined
)

const readItemRecords = (
  items: ItemList | undefined
): ReadonlyMap<ItemId, RecordId> => items
  ? ITEM_RECORDS_CACHE.get(items) ?? EMPTY_ITEM_RECORDS
  : EMPTY_ITEM_RECORDS

const readItemSections = (
  items: ItemList | undefined
): ReadonlyMap<ItemId, SectionKey> => items
  ? ITEM_SECTIONS_CACHE.get(items) ?? EMPTY_ITEM_SECTIONS
  : EMPTY_ITEM_SECTIONS

const readItemPlacements = (
  items: ItemList | undefined
): ReadonlyMap<ItemId, ItemPlacement> => items
  ? ITEM_PLACEMENTS_CACHE.get(items) ?? EMPTY_ITEM_PLACEMENTS
  : EMPTY_ITEM_PLACEMENTS

const sectionVisible = (input: {
  view: View
  sectionKey: SectionKey
  selectionCount: number
}) => {
  const group = input.view.group
  if (!group) {
    return true
  }

  if (group.buckets?.[input.sectionKey]?.hidden === true) {
    return false
  }

  return group.showEmpty !== false || input.selectionCount > 0
}

const sectionCollapsed = (
  view: View,
  sectionKey: SectionKey
) => view.group?.buckets?.[sectionKey]?.collapsed === true

const createItemList = (input: {
  ids: readonly ItemId[]
  records: ReadonlyMap<ItemId, RecordId>
  sections: ReadonlyMap<ItemId, SectionKey>
  placements: ReadonlyMap<ItemId, ItemPlacement>
  previous?: ItemList
}): ItemList => {
  if (
    input.previous
    && input.previous.ids === input.ids
    && input.previous.count === input.ids.length
    && readItemRecords(input.previous) === input.records
    && readItemSections(input.previous) === input.sections
    && readItemPlacements(input.previous) === input.placements
  ) {
    return input.previous
  }

  const items: ItemList = {
    ids: input.ids,
    count: input.ids.length,
    order: collection.createOrderedAccess(input.ids),
    read: {
      record: itemId => input.records.get(itemId),
      section: itemId => input.sections.get(itemId),
      placement: itemId => input.placements.get(itemId)
    }
  }

  ITEM_RECORDS_CACHE.set(items, input.records)
  ITEM_SECTIONS_CACHE.set(items, input.sections)
  ITEM_PLACEMENTS_CACHE.set(items, input.placements)

  return items
}

const buildPublishedState = (input: {
  view: View
  sections: MembershipState
  previous?: {
    items?: ItemList
    sections?: SectionList
  }
  previousSections?: MembershipState
  itemIds: ItemIdPool
}) => {
  const previousPublishedSections = input.previous?.sections
  const previousItems = input.previous?.items
  const previousItemRecords = readItemRecords(previousItems)
  const previousItemSections = readItemSections(previousItems)
  const previousItemPlacements = readItemPlacements(previousItems)
  const nextRecordByItemId = previousItems
    ? createMapPatchBuilder(previousItemRecords)
    : undefined
  const nextSectionByItemId = previousItems
    ? createMapPatchBuilder(previousItemSections)
    : undefined
  const nextPlacementByItemId = previousItems
    ? createMapPatchBuilder(previousItemPlacements)
    : undefined
  const addedItemIds: ItemId[] = []
  const removedItemIds: ItemId[] = []
  const visibleItemIds: ItemId[] = []
  const sections: Section[] = []
  const sectionByKey = new Map<SectionKey, Section>()
  const sectionKeys: SectionKey[] = []
  const changedSectionKeys: SectionKey[] = []
  const removedSectionKeys: SectionKey[] = []
  const nextSectionKeySet = new Set<SectionKey>()
  const createdRecordByItemId = new Map<ItemId, RecordId>()
  const createdSectionByItemId = new Map<ItemId, SectionKey>()
  const createdPlacementByItemId = new Map<ItemId, ItemPlacement>()

  const setItemState = (
    itemId: ItemId,
    recordId: RecordId,
    sectionKey: SectionKey,
    placement: ItemPlacement
  ) => {
    if (!previousItems) {
      createdRecordByItemId.set(itemId, recordId)
      createdSectionByItemId.set(itemId, sectionKey)
      createdPlacementByItemId.set(itemId, placement)
      return
    }

    nextRecordByItemId!.set(itemId, recordId)
    nextSectionByItemId!.set(itemId, sectionKey)
    nextPlacementByItemId!.set(itemId, placement)
  }

  const deleteItemState = (
    itemId: ItemId
  ) => {
    if (!previousItems) {
      return
    }

    nextRecordByItemId!.delete(itemId)
    nextSectionByItemId!.delete(itemId)
    nextPlacementByItemId!.delete(itemId)
  }

  const removePublishedSectionItems = (
    section: Section | undefined,
    nextItemIds?: ReadonlySet<ItemId>
  ) => {
    if (!section) {
      return
    }

    for (let index = 0; index < section.itemIds.length; index += 1) {
      const itemId = section.itemIds[index]!
      if (nextItemIds?.has(itemId)) {
        continue
      }

      deleteItemState(itemId)
      removedItemIds.push(itemId)
    }
  }

  input.sections.sections.order.forEach(sectionKey => {
    const selection = input.sections.sections.get(sectionKey)
    if (
      !selection
      || !sectionVisible({
        view: input.view,
        sectionKey,
        selectionCount: selection.indexes.length
      })
    ) {
      return
    }

    nextSectionKeySet.add(sectionKey)
    const meta = input.sections.meta.get(sectionKey)
    const collapsed = sectionCollapsed(input.view, sectionKey)
    const previousSection = previousPublishedSections?.get(sectionKey)
    const canReuseSection = Boolean(
      previousSection
      && input.previousSections?.sections.get(sectionKey) === selection
      && input.previousSections.meta.get(sectionKey) === meta
      && previousSection.collapsed === collapsed
    )

    if (canReuseSection && previousSection) {
      sections.push(previousSection)
      sectionKeys.push(sectionKey)
      sectionByKey.set(sectionKey, previousSection)
      if (!collapsed) {
        visibleItemIds.push(...previousSection.itemIds)
      }
      return
    }

    const nextRecordIds = selection.ids
    const publishedRecordIds = previousSection && equal.sameOrder(previousSection.recordIds, nextRecordIds)
      ? previousSection.recordIds
      : (nextRecordIds.length ? nextRecordIds : EMPTY_RECORD_IDS)
    const publishedItemIds = previousSection && previousSection.recordIds === publishedRecordIds
      ? previousSection.itemIds
      : (() => {
          if (!publishedRecordIds.length) {
            return EMPTY_ITEM_IDS
          }

          const nextItemIds = new Array<ItemId>(publishedRecordIds.length)
          for (let index = 0; index < publishedRecordIds.length; index += 1) {
            const recordId = publishedRecordIds[index]!
            const itemId = input.itemIds.allocate.placement(sectionKey, recordId)
            const placement = input.itemIds.read.placement(itemId)
            if (!placement) {
              throw new Error(`Missing item placement for ${itemId}`)
            }

            nextItemIds[index] = itemId
            if (!previousItemRecords.has(itemId)) {
              addedItemIds.push(itemId)
            }
            setItemState(itemId, recordId, sectionKey, placement)
          }

          return previousSection && equal.sameOrder(previousSection.itemIds, nextItemIds)
            ? previousSection.itemIds
            : nextItemIds
        })()

    if (!collapsed) {
      visibleItemIds.push(...publishedItemIds)
    }

    if (previousSection && previousSection.itemIds !== publishedItemIds) {
      removePublishedSectionItems(
        previousSection,
        publishedItemIds.length
          ? new Set(publishedItemIds)
          : undefined
      )
    }

    const section: Section = previousSection
      && input.previousSections?.meta.get(sectionKey) === meta
      && previousSection.collapsed === collapsed
      && previousSection.recordIds === publishedRecordIds
      && previousSection.itemIds === publishedItemIds
      ? previousSection
      : {
          key: sectionKey,
          label: meta?.label ?? sectionKey,
          color: meta?.color,
          bucket: meta?.bucket,
          collapsed,
          recordIds: publishedRecordIds,
          itemIds: publishedItemIds
        }
    sections.push(section)
    sectionKeys.push(sectionKey)
    sectionByKey.set(sectionKey, section)
    if (section !== previousSection) {
      changedSectionKeys.push(sectionKey)
    }
  })

  previousPublishedSections?.ids.forEach(sectionKey => {
    if (nextSectionKeySet.has(sectionKey)) {
      return
    }

    removedSectionKeys.push(sectionKey)
    removePublishedSectionItems(previousPublishedSections.get(sectionKey))
  })

  const previousVisibleIds = previousItems?.ids
  const publishedVisibleIds = previousVisibleIds && equal.sameOrder(previousVisibleIds, visibleItemIds)
    ? previousVisibleIds
    : (visibleItemIds.length ? visibleItemIds : EMPTY_ITEM_IDS)
  const items = createItemList({
    ids: publishedVisibleIds,
    records: previousItems
      ? nextRecordByItemId!.finish()
      : (createdRecordByItemId.size ? createdRecordByItemId : EMPTY_ITEM_RECORDS),
    sections: previousItems
      ? nextSectionByItemId!.finish()
      : (createdSectionByItemId.size ? createdSectionByItemId : EMPTY_ITEM_SECTIONS),
    placements: previousItems
      ? nextPlacementByItemId!.finish()
      : (createdPlacementByItemId.size ? createdPlacementByItemId : EMPTY_ITEM_PLACEMENTS),
    previous: previousItems
  })
  const publishedSectionKeys = previousPublishedSections && equal.sameOrder(previousPublishedSections.ids, sectionKeys)
    ? previousPublishedSections.ids
    : (sectionKeys.length ? sectionKeys : EMPTY_SECTION_KEYS)
  const publishedSections = previousPublishedSections
    && previousPublishedSections.all.length === sections.length
    && previousPublishedSections.all.every((section, index) => section === sections[index])
    ? previousPublishedSections.all
    : sections

  const list = previousPublishedSections
    && previousPublishedSections.ids === publishedSectionKeys
    && previousPublishedSections.all === publishedSections
    ? previousPublishedSections
    : collection.createOrderedKeyedCollection({
        ids: publishedSectionKeys,
        all: publishedSections,
        get: sectionKey => sectionByKey.get(sectionKey)
      })

  return {
    items,
    sections: list,
    delta: previousPublishedSections || previousItems
      ? {
          sections: createCollectionDelta({
            list: previousPublishedSections?.ids !== publishedSectionKeys,
            update: changedSectionKeys,
            remove: removedSectionKeys
          }),
          items: createCollectionDelta({
            list: previousVisibleIds !== publishedVisibleIds,
            update: addedItemIds,
            remove: removedItemIds
          })
        }
      : undefined
  }
}

export const publishSections = (input: {
  view: View
  sections: MembershipState
  previousSections?: MembershipState
  previous?: {
    items?: ItemList
    sections?: SectionList
  }
  itemIds: ItemIdPool
}): {
  items: ItemList
  sections: SectionList
  delta?: {
    sections?: CollectionDelta<SectionKey>
    items?: CollectionDelta<ItemId>
  }
} => buildPublishedState(input)

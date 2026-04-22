import { collection, equal } from '@shared/core'
import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  createCollectionDelta
} from '@dataview/engine/active/shared/delta'
import type {
  CollectionDelta
} from '@dataview/engine/contracts/delta'
import type {
  ItemId,
  ItemList,
  ItemPlacement,
  Section,
  SectionKey,
  SectionList
} from '@dataview/engine/contracts/shared'
import type {
  MembershipPhaseState as MembershipState
} from '@dataview/engine/active/state'
import type {
  ItemIdPool
} from '@dataview/engine/active/shared/itemIdPool'

const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]
const EMPTY_ITEM_PLACEMENTS = new Map<ItemId, ItemPlacement>()
const ITEM_PLACEMENTS_CACHE = new WeakMap<ItemList, ReadonlyMap<ItemId, ItemPlacement>>()
const MIN_LARGE_PLACEMENT_TOUCH_COUNT = 256

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
  placements: ReadonlyMap<ItemId, ItemPlacement>
  previous?: ItemList
}): ItemList => {
  if (
    input.previous
    && input.previous.ids === input.ids
    && input.previous.count === input.ids.length
    && readItemPlacements(input.previous) === input.placements
  ) {
    return input.previous
  }

  const items: ItemList = {
    ids: input.ids,
    count: input.ids.length,
    order: collection.createOrderedAccess(input.ids),
    read: {
      record: itemId => input.placements.get(itemId)?.recordId,
      section: itemId => input.placements.get(itemId)?.sectionKey,
      placement: itemId => input.placements.get(itemId)
    }
  }

  ITEM_PLACEMENTS_CACHE.set(items, input.placements)

  return items
}

const collectRemovedItemIdsFromRecordSubsequence = (input: {
  previousSection: Section
  nextRecordIds: readonly RecordId[]
}): readonly ItemId[] | undefined => {
  const previousRecordIds = input.previousSection.recordIds
  if (input.nextRecordIds.length > previousRecordIds.length) {
    return undefined
  }

  const removedItemIds: ItemId[] = []
  let nextIndex = 0
  for (let previousIndex = 0; previousIndex < previousRecordIds.length; previousIndex += 1) {
    if (
      nextIndex < input.nextRecordIds.length
      && previousRecordIds[previousIndex] === input.nextRecordIds[nextIndex]
    ) {
      nextIndex += 1
      continue
    }

    removedItemIds.push(input.previousSection.itemIds[previousIndex]!)
  }

  return nextIndex === input.nextRecordIds.length
    ? removedItemIds
    : undefined
}

const shouldRebuildPlacementState = (input: {
  previousCount: number
  touchedCount: number
}) => input.touchedCount >= MIN_LARGE_PLACEMENT_TOUCH_COUNT
  && input.touchedCount * 2 > input.previousCount

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
  const previousItemPlacements = readItemPlacements(previousItems)
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
  const createdPlacementByItemId = new Map<ItemId, ItemPlacement>()
  let touchedPlacementCount = 0
  let rebuiltPlacementByItemId: Map<ItemId, ItemPlacement> | undefined

  const readCurrentPlacement = (
    itemId: ItemId
  ): ItemPlacement | undefined => previousItems
    ? nextPlacementByItemId!.get(itemId)
    : createdPlacementByItemId.get(itemId)

  const addPublishedItemPlacements = (
    itemIds: readonly ItemId[]
  ) => {
    if (!rebuiltPlacementByItemId) {
      return
    }

    for (let index = 0; index < itemIds.length; index += 1) {
      const itemId = itemIds[index]!
      const placement = readCurrentPlacement(itemId)
      if (!placement) {
        throw new Error(`Missing item placement for ${itemId}`)
      }

      rebuiltPlacementByItemId.set(itemId, placement)
    }
  }

  const startPlacementRebuild = () => {
    if (!previousItems || rebuiltPlacementByItemId) {
      return
    }

    rebuiltPlacementByItemId = new Map<ItemId, ItemPlacement>()
    for (let index = 0; index < sections.length; index += 1) {
      addPublishedItemPlacements(sections[index]!.itemIds)
    }
  }

  const trackPlacementTouches = (
    count: number
  ) => {
    if (
      rebuiltPlacementByItemId
      || !previousItems
      || count <= 0
    ) {
      return
    }

    touchedPlacementCount += count
    if (!shouldRebuildPlacementState({
      previousCount: previousItemPlacements.size,
      touchedCount: touchedPlacementCount
    })) {
      return
    }

    startPlacementRebuild()
  }

  const setItemState = (
    itemId: ItemId,
    placement: ItemPlacement
  ) => {
    if (rebuiltPlacementByItemId) {
      rebuiltPlacementByItemId.set(itemId, placement)
      return
    }

    if (!previousItems) {
      createdPlacementByItemId.set(itemId, placement)
      return
    }

    nextPlacementByItemId!.set(itemId, placement)
  }

  const deleteItemState = (
    itemId: ItemId
  ) => {
    if (!previousItems || rebuiltPlacementByItemId) {
      return
    }

    nextPlacementByItemId!.delete(itemId)
  }

  const removePublishedItem = (
    itemId: ItemId
  ) => {
    deleteItemState(itemId)
    removedItemIds.push(itemId)
  }

  const removePublishedSectionItems = (
    input: {
      section?: Section
      nextRecordIds?: readonly RecordId[]
      nextItemIds?: readonly ItemId[]
    }
  ) => {
    const section = input.section
    if (!section) {
      return
    }

    if (!input.nextItemIds?.length) {
      for (let index = 0; index < section.itemIds.length; index += 1) {
        const itemId = section.itemIds[index]!
        removePublishedItem(itemId)
      }
      return
    }

    const removedBySubsequence = input.nextRecordIds
      ? collectRemovedItemIdsFromRecordSubsequence({
          previousSection: section,
          nextRecordIds: input.nextRecordIds
        })
      : undefined
    if (removedBySubsequence) {
      for (let index = 0; index < removedBySubsequence.length; index += 1) {
        const itemId = removedBySubsequence[index]!
        removePublishedItem(itemId)
      }
      return
    }

    const nextItemIds = new Set(input.nextItemIds)

    for (let index = 0; index < section.itemIds.length; index += 1) {
      const itemId = section.itemIds[index]!
      if (nextItemIds.has(itemId)) {
        continue
      }

      removePublishedItem(itemId)
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
      addPublishedItemPlacements(previousSection.itemIds)
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
    const reusesPublishedItems = previousSection?.recordIds === publishedRecordIds
    if (!reusesPublishedItems) {
      trackPlacementTouches(
        Math.max(previousSection?.itemIds.length ?? 0, publishedRecordIds.length)
      )
    }
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
            const previousPlacement = previousItemPlacements.get(itemId)
            const placement = previousPlacement ?? {
              sectionKey,
              recordId
            }
            nextItemIds[index] = itemId
            if (!previousPlacement) {
              addedItemIds.push(itemId)
            }
            setItemState(itemId, placement)
          }

          return previousSection && equal.sameOrder(previousSection.itemIds, nextItemIds)
            ? previousSection.itemIds
            : nextItemIds
        })()
    if (rebuiltPlacementByItemId && reusesPublishedItems) {
      addPublishedItemPlacements(publishedItemIds)
    }

    if (!collapsed) {
      visibleItemIds.push(...publishedItemIds)
    }

    if (previousSection && previousSection.itemIds !== publishedItemIds) {
      removePublishedSectionItems(
        {
          section: previousSection,
          nextRecordIds: publishedRecordIds,
          nextItemIds: publishedItemIds
        }
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

    const removedSection = previousPublishedSections.get(sectionKey)
    trackPlacementTouches(removedSection?.itemIds.length ?? 0)
    removedSectionKeys.push(sectionKey)
    removePublishedSectionItems({
      section: removedSection
    })
  })

  const previousVisibleIds = previousItems?.ids
  const publishedVisibleIds = previousVisibleIds && equal.sameOrder(previousVisibleIds, visibleItemIds)
    ? previousVisibleIds
    : (visibleItemIds.length ? visibleItemIds : EMPTY_ITEM_IDS)
  const items = createItemList({
    ids: publishedVisibleIds,
    placements: rebuiltPlacementByItemId
      ? (rebuiltPlacementByItemId.size ? rebuiltPlacementByItemId : EMPTY_ITEM_PLACEMENTS)
      : previousItems
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

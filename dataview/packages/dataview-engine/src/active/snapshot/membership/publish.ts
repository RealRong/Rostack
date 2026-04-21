import { collection, equal } from '@shared/core'
import type {
  RecordId,
  View
} from '@dataview/core/contracts'
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
const EMPTY_ITEM_PLACEMENTS = new Map<ItemId, ItemPlacement>()
const EMPTY_ITEM_RECORDS = new Map<ItemId, RecordId>()
const EMPTY_ITEM_SECTIONS = new Map<ItemId, SectionKey>()

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

const sameItemRead = (input: {
  items: ItemList
  ids: readonly ItemId[]
  records: ReadonlyMap<ItemId, RecordId>
  sections: ReadonlyMap<ItemId, SectionKey>
}) => input.ids.every(itemId => (
  input.items.read.record(itemId) === input.records.get(itemId)
  && input.items.read.section(itemId) === input.sections.get(itemId)
))

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
    && sameItemRead({
      items: input.previous,
      ids: input.ids,
      records: input.records,
      sections: input.sections
    })
  ) {
    return input.previous
  }

  return {
    ids: input.ids,
    count: input.ids.length,
    order: collection.createOrderedAccess(input.ids),
    read: {
      record: itemId => input.records.get(itemId),
      section: itemId => input.sections.get(itemId),
      placement: itemId => input.placements.get(itemId)
    }
  }
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
  const previousSections = input.previous?.sections
  const visibleItemIds: ItemId[] = []
  const keepItemIds = new Set<ItemId>()
  const recordByItemId = new Map<ItemId, RecordId>()
  const sectionByItemId = new Map<ItemId, SectionKey>()
  const placementByItemId = new Map<ItemId, ItemPlacement>()
  const sections: Section[] = []
  const sectionByKey = new Map<SectionKey, Section>()
  const sectionKeys: SectionKey[] = []

  input.sections.sections.order.forEach(sectionKey => {
    const selection = input.sections.sections.get(sectionKey)
    if (
      !selection
      || !sectionVisible({
        view: input.view,
        sectionKey,
        selectionCount: selection.read.count()
      })
    ) {
      return
    }

    const meta = input.sections.meta.get(sectionKey)
    const nextRecordIds = selection.read.ids()
    const previousSection = previousSections?.get(sectionKey)
    const publishedRecordIds = previousSection && equal.sameOrder(previousSection.recordIds, nextRecordIds)
      ? previousSection.recordIds
      : (nextRecordIds.length ? nextRecordIds : EMPTY_RECORD_IDS)
    const nextItemIds = new Array<ItemId>(publishedRecordIds.length)
    const collapsed = sectionCollapsed(input.view, sectionKey)

    for (let index = 0; index < publishedRecordIds.length; index += 1) {
      const recordId = publishedRecordIds[index]!
      const itemId = input.itemIds.allocate.placement(sectionKey, recordId)
      const placement = input.itemIds.read.placement(itemId)
      if (!placement) {
        throw new Error(`Missing item placement for ${itemId}`)
      }

      nextItemIds[index] = itemId
      keepItemIds.add(itemId)
      recordByItemId.set(itemId, recordId)
      sectionByItemId.set(itemId, sectionKey)
      placementByItemId.set(itemId, placement)
      if (!collapsed) {
        visibleItemIds.push(itemId)
      }
    }

    const publishedItemIds = previousSection && equal.sameOrder(previousSection.itemIds, nextItemIds)
      ? previousSection.itemIds
      : (nextItemIds.length ? nextItemIds : EMPTY_ITEM_IDS)
    const canReuse = Boolean(
      previousSection
      && input.previousSections?.sections.get(sectionKey) === selection
      && input.previousSections.meta.get(sectionKey) === meta
      && previousSection.collapsed === collapsed
      && previousSection.recordIds === publishedRecordIds
      && previousSection.itemIds === publishedItemIds
    )

    const section: Section = canReuse && previousSection
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
  })

  input.itemIds.gc.keep(keepItemIds)

  const previousVisibleIds = input.previous?.items?.ids
  const publishedVisibleIds = previousVisibleIds && equal.sameOrder(previousVisibleIds, visibleItemIds)
    ? previousVisibleIds
    : (visibleItemIds.length ? visibleItemIds : EMPTY_ITEM_IDS)
  const items = createItemList({
    ids: publishedVisibleIds,
    records: recordByItemId.size
      ? recordByItemId
      : EMPTY_ITEM_RECORDS,
    sections: sectionByItemId.size
      ? sectionByItemId
      : EMPTY_ITEM_SECTIONS,
    placements: placementByItemId.size
      ? placementByItemId
      : EMPTY_ITEM_PLACEMENTS,
    previous: input.previous?.items
  })
  const publishedSectionKeys = previousSections && equal.sameOrder(previousSections.ids, sectionKeys)
    ? previousSections.ids
    : sectionKeys
  const publishedSections = previousSections
    && previousSections.all.length === sections.length
    && previousSections.all.every((section, index) => section === sections[index])
    ? previousSections.all
    : sections

  const list = previousSections
    && previousSections.ids === publishedSectionKeys
    && previousSections.all === publishedSections
    ? previousSections
    : collection.createOrderedKeyedCollection({
        ids: publishedSectionKeys,
        all: publishedSections,
        get: sectionKey => sectionByKey.get(sectionKey)
      })

  return {
    items,
    sections: list
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
} => buildPublishedState(input)

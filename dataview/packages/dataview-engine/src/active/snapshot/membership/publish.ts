import { equal } from '@shared/core'
import type {
  RecordId,
  View
} from '@dataview/core/contracts'
import {
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'
import {
  createItemId
} from '@dataview/engine/active/shared/itemId'
import type {
  ItemId,
  ItemList,
  Section,
  SectionKey,
  SectionList,
  ViewItem
} from '@dataview/engine/contracts'
import type {
  MembershipMetaState,
  MembershipState
} from '@dataview/engine/contracts/state'

const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_ITEMS_BY_ID = new Map<ItemId, ViewItem>()

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
}): readonly ItemId[] => {
  if (!input.recordIds.length) {
    return EMPTY_ITEM_IDS
  }

  const ids = new Array<ItemId>(input.recordIds.length)
  for (let index = 0; index < input.recordIds.length; index += 1) {
    ids[index] = createItemId(input.sectionKey, input.recordIds[index]!)
  }

  return ids
}

const buildItemsById = (input: {
  view: View
  sections: MembershipState
  previous?: {
    items?: ItemList
  }
}): ReadonlyMap<ItemId, ViewItem> => {
  const previousItems = input.previous?.items
  const next = new Map<ItemId, ViewItem>()

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

    selection.read.ids().forEach(recordId => {
      const id = createItemId(sectionKey, recordId)
      const previous = previousItems?.get(id)
      next.set(id, previous && previous.recordId === recordId && previous.sectionKey === sectionKey
        ? previous
        : {
            id,
            recordId,
            sectionKey
          })
    })
  })

  return next.size
    ? next
    : EMPTY_ITEMS_BY_ID
}

const buildSections = (input: {
  view: View
  sections: MembershipState
  previous?: SectionList
  previousSections?: MembershipState
  byId: ReadonlyMap<ItemId, ViewItem>
}): SectionList => {
  const previous = input.previous
  const sections: Section[] = []
  const byKey = new Map<SectionKey, Section>()
  const ids: SectionKey[] = []

  input.sections.sections.order.forEach(key => {
    const selection = input.sections.sections.get(key)
    if (
      !selection
      || !sectionVisible({
        view: input.view,
        sectionKey: key,
        selectionCount: selection.read.count()
      })
    ) {
      return
    }

    const meta = input.sections.meta.get(key)
    const nextRecordIds = selection.read.ids()
    const nextItemIds = projectSectionItemIds({
      sectionKey: key,
      recordIds: nextRecordIds
    })
    const previousSection = previous?.get(key)
    const publishedItemIds = previousSection && equal.sameOrder(previousSection.items.ids, nextItemIds)
      ? previousSection.items.ids
      : nextItemIds
    const items = createItemList({
      ids: publishedItemIds,
      byId: input.byId,
      previous: previousSection?.items
    })
    const collapsed = sectionCollapsed(input.view, key)
    const canReuse = Boolean(
      previousSection
      && input.previousSections?.sections.get(key) === selection
      && input.previousSections.meta.get(key) === meta
      && previousSection.items === items
      && previousSection.collapsed === collapsed
    )

    const section: Section = canReuse && previousSection
      ? previousSection
      : {
          key,
          label: meta?.label ?? key,
          color: meta?.color,
          bucket: meta?.bucket,
          recordIds: nextRecordIds,
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

export const publishSections = (input: {
  view: View
  sections: MembershipState
  previousSections?: MembershipState
  previous?: {
    items?: ItemList
    sections?: SectionList
  }
}): {
  items: ItemList
  sections: SectionList
} => {
  const byId = buildItemsById({
    view: input.view,
    sections: input.sections,
    previous: input.previous
  })
  const sections = buildSections({
    view: input.view,
    sections: input.sections,
    previous: input.previous?.sections,
    previousSections: input.previousSections,
    byId
  })
  const items = buildItemList({
    sections,
    byId,
    previous: input.previous?.items,
    previousSections: input.previous?.sections
  })

  return {
    items,
    sections
  }
}

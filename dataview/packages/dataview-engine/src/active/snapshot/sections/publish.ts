import type {
  RecordId
} from '@dataview/core/contracts'
import {
  sameOrder
} from '@shared/core'
import {
  createOrderedKeyedListAccess,
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'
import {
  createItemIdentityBuilder,
  type ItemIdentityCache,
  type ItemIdentityTable
} from '@dataview/engine/active/shared/itemIdentity'
import type {
  ItemId,
  ItemList,
  Section,
  SectionKey,
  SectionList
} from '@dataview/engine/contracts/public'
import type { SectionState } from '@dataview/engine/contracts/internal'

const createItemList = (input: {
  ids: readonly ItemId[]
  count: number
  table: ItemIdentityTable
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

  const items = createOrderedKeyedListAccess({
    ids: input.ids,
    get: id => input.table.get(id)
  })

  return {
    ...items,
    count: input.count,
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
        return []
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return input.ids.slice(start, end + 1)
    }
  }
}

const resolvePreviousItem = (input: {
  previous?: {
    items?: ItemList
    sections?: SectionList
  }
  id: ItemId
  sectionKey: SectionKey
}) => input.previous?.items?.get(input.id)
  ?? input.previous?.sections?.get(input.sectionKey)?.items.get(input.id)

const buildSections = (input: {
  sections: SectionState
  previous?: SectionList
  previousSections?: SectionState
  table: ItemIdentityTable
  idsBySection: ReadonlyMap<SectionKey, readonly ItemId[]>
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

    const nextItemIds = input.idsBySection.get(node.key) ?? []
    const previousSection = previous?.get(node.key)
    const publishedItemIds = previousSection && sameOrder(previousSection.items.ids, nextItemIds)
      ? previousSection.items.ids
      : nextItemIds
    const items = createItemList({
      ids: publishedItemIds,
      count: node.recordIds.length,
      table: input.table,
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
  table: ItemIdentityTable
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

  return createItemList({
    ids: publishedIds,
    count: totalIdCount,
    table: input.table,
    previous
  })
}

export const publishSections = (input: {
  sections: SectionState
  previousSections?: SectionState
  previousIdentity: ItemIdentityCache
  previous?: {
    items?: ItemList
    sections?: SectionList
  }
}): {
  identity: ItemIdentityCache
  items: ItemList
  sections: SectionList
} => {
  const identity = createItemIdentityBuilder({
    previous: input.previousIdentity,
    resolvePreviousItem: (id, sectionKey) => resolvePreviousItem({
      previous: input.previous,
      id,
      sectionKey
    })
  })
  const idsBySection = new Map<SectionKey, readonly ItemId[]>()

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const ids = new Array<ItemId>(section.recordIds.length)
    for (let index = 0; index < section.recordIds.length; index += 1) {
      ids[index] = identity.intern(sectionKey, section.recordIds[index]!)
    }
    idsBySection.set(sectionKey, ids)
  })

  const builtIdentity = identity.finish()
  const sections = buildSections({
    sections: input.sections,
    previous: input.previous?.sections,
    previousSections: input.previousSections,
    table: builtIdentity.table,
    idsBySection
  })
  const items = buildItemList({
    sections,
    table: builtIdentity.table,
    previous: input.previous?.items
  })

  return {
    identity: builtIdentity.cache,
    items,
    sections
  }
}

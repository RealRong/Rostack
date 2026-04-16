import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionKey,
  ViewItem
} from '@dataview/engine/contracts/public'

export interface ItemIdentityCache {
  nextId: number
  bySection: ReadonlyMap<SectionKey, ReadonlyMap<RecordId, ItemId>>
}

export interface ItemIdentityTable {
  get(id: ItemId): ViewItem | undefined
  idOf(sectionKey: SectionKey, recordId: RecordId): ItemId | undefined
}

const EMPTY_ITEM_IDENTITIES = new Map<SectionKey, ReadonlyMap<RecordId, ItemId>>()

export const emptyItemIdentityCache = (): ItemIdentityCache => ({
  nextId: 1,
  bySection: EMPTY_ITEM_IDENTITIES
})

export const createItemIdentityBuilder = (input: {
  previous: ItemIdentityCache
  resolvePreviousItem?: (id: ItemId, sectionKey: SectionKey) => ViewItem | undefined
}) => {
  const bySection = new Map<SectionKey, Map<RecordId, ItemId>>()
  const byId = new Map<ItemId, ViewItem>()
  let nextId = input.previous.nextId

  const intern = (
    sectionKey: SectionKey,
    recordId: RecordId
  ): ItemId => {
    const existingSection = bySection.get(sectionKey)
    const existingId = existingSection?.get(recordId)
    if (existingId !== undefined) {
      return existingId
    }

    const reusedId = input.previous.bySection.get(sectionKey)?.get(recordId)
    const id = reusedId ?? nextId++
    const sectionMap = existingSection ?? new Map<RecordId, ItemId>()
    sectionMap.set(recordId, id)
    if (!existingSection) {
      bySection.set(sectionKey, sectionMap)
    }

    if (!byId.has(id)) {
      byId.set(
        id,
        input.resolvePreviousItem?.(id, sectionKey) ?? {
          id,
          sectionKey,
          recordId
        }
      )
    }

    return id
  }

  const table: ItemIdentityTable = {
    get: id => byId.get(id),
    idOf: (sectionKey, recordId) => bySection.get(sectionKey)?.get(recordId)
  }

  return {
    intern,
    finish(): {
      cache: ItemIdentityCache
      table: ItemIdentityTable
    } {
      return {
        cache: {
          nextId,
          bySection
        },
        table
      }
    }
  }
}

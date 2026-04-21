import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  ItemIdPool,
  ItemPlacement,
  SectionKey
} from '@dataview/engine/contracts/shared'

export const createItemIdPool = (): ItemIdPool => {
  let nextId = 1
  const idsBySection = new Map<SectionKey, Map<RecordId, ItemId>>()
  const placementById = new Map<ItemId, ItemPlacement>()

  const ensureSection = (sectionKey: SectionKey) => {
    const existing = idsBySection.get(sectionKey)
    if (existing) {
      return existing
    }

    const created = new Map<RecordId, ItemId>()
    idsBySection.set(sectionKey, created)
    return created
  }

  return {
    allocate: {
      placement: (sectionKey, recordId) => {
        const idsByRecord = ensureSection(sectionKey)
        const existing = idsByRecord.get(recordId)
        if (existing !== undefined) {
          return existing
        }

        const itemId = nextId
        nextId += 1
        idsByRecord.set(recordId, itemId)
        placementById.set(itemId, {
          sectionKey,
          recordId
        })
        return itemId
      }
    },
    read: {
      placement: itemId => placementById.get(itemId)
    },
    gc: {
      keep: _itemIds => {},
      clear: () => {
        nextId = 1
        idsBySection.clear()
        placementById.clear()
      }
    }
  }
}

import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine/contracts/shared'

export interface ItemIdPool {
  allocate: {
    placement: (sectionKey: SectionKey, recordId: RecordId) => ItemId
  }
  gc: {
    clear: () => void
  }
}

export const createItemIdPool = (): ItemIdPool => {
  let nextId = 1
  const idsBySection = new Map<SectionKey, Map<RecordId, ItemId>>()

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
        return itemId
      }
    },
    gc: {
      clear: () => {
        nextId = 1
        idsBySection.clear()
      }
    }
  }
}

import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionId
} from '@dataview/engine/contracts/shared'

export interface ItemIdPool {
  allocate: {
    placement: (sectionId: SectionId, recordId: RecordId) => ItemId
    section: (sectionId: SectionId) => (recordId: RecordId) => ItemId
  }
  gc: {
    clear: () => void
  }
}

export const createItemIdPool = (): ItemIdPool => {
  let nextId = 1
  const idsBySection = new Map<SectionId, Map<RecordId, ItemId>>()

  const ensureSection = (sectionId: SectionId) => {
    const existing = idsBySection.get(sectionId)
    if (existing) {
      return existing
    }

    const created = new Map<RecordId, ItemId>()
    idsBySection.set(sectionId, created)
    return created
  }

  const allocateInSection = (
    idsByRecord: Map<RecordId, ItemId>,
    recordId: RecordId
  ): ItemId => {
    const existing = idsByRecord.get(recordId)
    if (existing !== undefined) {
      return existing
    }

    const itemId = nextId
    nextId += 1
    idsByRecord.set(recordId, itemId)
    return itemId
  }

  return {
    allocate: {
      placement: (sectionId, recordId) => {
        const idsByRecord = ensureSection(sectionId)
        return allocateInSection(idsByRecord, recordId)
      },
      section: sectionId => {
        const idsByRecord = ensureSection(sectionId)
        return recordId => allocateInSection(idsByRecord, recordId)
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

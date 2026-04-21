import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine/contracts/shared'

export const createItemId = (
  sectionKey: SectionKey,
  recordId: RecordId
): ItemId => `${encodeURIComponent(sectionKey)}:${encodeURIComponent(recordId)}`

import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionKey,
  ViewItem
} from '@dataview/engine/contracts'

export type SectionRecordKey = string

export interface ItemProjectionCache {
  mode: 'root' | 'grouped'
  nextId: number
  byId: ReadonlyMap<ItemId, ViewItem>
  bySectionRecord: ReadonlyMap<SectionRecordKey, ItemId>
}

const EMPTY_ITEMS_BY_ID = new Map<ItemId, ViewItem>()
const EMPTY_SECTION_RECORD_IDENTITIES = new Map<SectionRecordKey, ItemId>()

export const createSectionRecordKey = (
  sectionKey: SectionKey,
  recordId: RecordId
): SectionRecordKey => `${sectionKey}\u0000${recordId}`

export const emptyItemProjectionCache = (): ItemProjectionCache => ({
  mode: 'root',
  nextId: 1,
  byId: EMPTY_ITEMS_BY_ID,
  bySectionRecord: EMPTY_SECTION_RECORD_IDENTITIES
})

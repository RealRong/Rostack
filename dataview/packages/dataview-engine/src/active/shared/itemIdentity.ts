import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  ItemId,
  SectionKey,
  ViewItem
} from '@dataview/engine/contracts'

export interface ItemProjectionCache {
  nextId: number
  byId: ReadonlyMap<ItemId, ViewItem>
  rootByRecord: ReadonlyMap<RecordId, ItemId>
  grouped: ReadonlyMap<SectionKey, GroupedItemProjection>
}

export interface GroupedItemProjection {
  ids: readonly ItemId[]
  byRecord: ReadonlyMap<RecordId, ItemId>
}

const EMPTY_ITEMS_BY_ID = new Map<ItemId, ViewItem>()
const EMPTY_ROOT_IDENTITIES = new Map<RecordId, ItemId>()
const EMPTY_GROUPED_IDENTITIES = new Map<SectionKey, GroupedItemProjection>()

export const emptyItemProjectionCache = (): ItemProjectionCache => ({
  nextId: 1,
  byId: EMPTY_ITEMS_BY_ID,
  rootByRecord: EMPTY_ROOT_IDENTITIES,
  grouped: EMPTY_GROUPED_IDENTITIES
})

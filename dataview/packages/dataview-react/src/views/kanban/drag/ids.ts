import type { ItemId, SectionKey } from '@dataview/engine'

export interface DropTarget {
  sectionKey: SectionKey
  beforeItemId?: ItemId
}

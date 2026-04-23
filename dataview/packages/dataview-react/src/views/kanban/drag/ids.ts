import type { ItemId, SectionId } from '@dataview/engine'

export interface DropTarget {
  sectionId: SectionId
  beforeItemId?: ItemId
}

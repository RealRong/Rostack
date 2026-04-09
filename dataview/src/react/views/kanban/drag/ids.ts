import type { AppearanceId, SectionKey } from '@dataview/engine/projection/view'

export interface DropTarget {
  sectionKey: SectionKey
  beforeAppearanceId?: AppearanceId
}

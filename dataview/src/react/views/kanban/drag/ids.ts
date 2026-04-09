import type { AppearanceId, SectionKey } from '@dataview/engine/project'

export interface DropTarget {
  sectionKey: SectionKey
  beforeAppearanceId?: AppearanceId
}

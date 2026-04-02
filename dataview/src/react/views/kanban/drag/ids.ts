import type { AppearanceId, SectionKey } from '@dataview/react/currentView'

export interface DropTarget {
  sectionKey: SectionKey
  beforeAppearanceId?: AppearanceId
}

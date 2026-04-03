import type { AppearanceId, SectionKey } from '@dataview/react/runtime/currentView'

export interface DropTarget {
  sectionKey: SectionKey
  beforeAppearanceId?: AppearanceId
}

import type { AppearanceId, SectionKey } from '@/react/view'

export interface DropTarget {
  sectionKey: SectionKey
  beforeAppearanceId?: AppearanceId
}

import type { GroupGalleryOptions } from './gallery'
import type { GroupKanbanOptions } from './kanban'
import type { PropertyId } from './state'

export interface GroupViewDisplayOptions {
  propertyIds: readonly PropertyId[]
}

export interface GroupTableOptions {
  widths: Readonly<Partial<Record<PropertyId, number>>>
}

export interface GroupViewOptions {
  display: GroupViewDisplayOptions
  table: GroupTableOptions
  gallery: GroupGalleryOptions
  kanban: GroupKanbanOptions
}

import type { GalleryOptions } from './gallery'
import type { KanbanOptions } from './kanban'
import type { FieldId } from './state'

export interface ViewDisplayOptions {
  fieldIds: readonly FieldId[]
}

export interface TableOptions {
  widths: Readonly<Partial<Record<FieldId, number>>>
  showVerticalLines: boolean
}

export interface ViewOptions {
  display: ViewDisplayOptions
  table: TableOptions
  gallery: GalleryOptions
  kanban: KanbanOptions
}

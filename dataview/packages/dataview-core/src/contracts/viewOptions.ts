import type { GalleryOptions } from '#dataview-core/contracts/gallery'
import type { KanbanOptions } from '#dataview-core/contracts/kanban'
import type { FieldId } from '#dataview-core/contracts/state'

export interface TableOptions {
  widths: Readonly<Partial<Record<FieldId, number>>>
  showVerticalLines: boolean
}

export interface ViewOptions {
  table: TableOptions
  gallery: GalleryOptions
  kanban: KanbanOptions
}

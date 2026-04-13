import type { GalleryOptions } from '#core/contracts/gallery'
import type { KanbanOptions } from '#core/contracts/kanban'
import type { FieldId } from '#core/contracts/state'

export interface TableOptions {
  widths: Readonly<Partial<Record<FieldId, number>>>
  showVerticalLines: boolean
}

export interface ViewOptions {
  table: TableOptions
  gallery: GalleryOptions
  kanban: KanbanOptions
}

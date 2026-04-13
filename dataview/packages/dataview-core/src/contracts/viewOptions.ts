import type { GalleryOptions } from '#core/contracts/gallery.ts'
import type { KanbanOptions } from '#core/contracts/kanban.ts'
import type { FieldId } from '#core/contracts/state.ts'

export interface TableOptions {
  widths: Readonly<Partial<Record<FieldId, number>>>
  showVerticalLines: boolean
}

export interface ViewOptions {
  table: TableOptions
  gallery: GalleryOptions
  kanban: KanbanOptions
}

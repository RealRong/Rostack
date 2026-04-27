import type { GalleryOptions } from '@dataview/core/types/state'
import type { KanbanOptions } from '@dataview/core/types/state'
import type { FieldId } from '@dataview/core/types/state'

export interface TableOptions {
  widths: Readonly<Partial<Record<FieldId, number>>>
  showVerticalLines: boolean
  wrap: boolean
}

export interface ViewOptionsByType {
  table: TableOptions
  gallery: GalleryOptions
  kanban: KanbanOptions
}

export type ViewLayoutOptions = ViewOptionsByType[keyof ViewOptionsByType]

import type {
  FieldId,
  TableOptions,
  ViewType
} from '@dataview/core/types'
import type {
  ViewOptionsByType
} from '@dataview/core/types/state'
import type { GalleryOptions } from '@dataview/core/types/state'
import type { KanbanOptions } from '@dataview/core/types/state'
import { json } from '@shared/core'

export const isJsonObject = json.isJsonObject

export function cloneViewOptions (
  type: 'table',
  options: TableOptions
): TableOptions
export function cloneViewOptions (
  type: 'gallery',
  options: GalleryOptions
): GalleryOptions
export function cloneViewOptions (
  type: 'kanban',
  options: KanbanOptions
): KanbanOptions
export function cloneViewOptions (
  type: ViewType,
  options: ViewOptionsByType[ViewType]
): ViewOptionsByType[ViewType] {
  switch (type) {
    case 'table':
      return {
        widths: {
          ...(options as TableOptions).widths
        },
        showVerticalLines: (options as TableOptions).showVerticalLines,
        wrap: (options as TableOptions).wrap
      }
    case 'gallery':
      return {
        card: {
          wrap: (options as GalleryOptions).card.wrap,
          size: (options as GalleryOptions).card.size,
          layout: (options as GalleryOptions).card.layout
        }
      }
    case 'kanban':
      return {
        card: {
          wrap: (options as KanbanOptions).card.wrap,
          size: (options as KanbanOptions).card.size,
          layout: (options as KanbanOptions).card.layout
        },
        fillColumnColor: (options as KanbanOptions).fillColumnColor,
        cardsPerColumn: (options as KanbanOptions).cardsPerColumn
      }
  }
}

export const resolveDisplayInsertBeforeFieldId = (
  fieldIds: readonly FieldId[],
  anchorFieldId: FieldId,
  side: 'left' | 'right'
): FieldId | null => {
  const anchorIndex = fieldIds.findIndex(fieldId => fieldId === anchorFieldId)
  if (anchorIndex === -1) {
    return null
  }

  return side === 'left'
    ? anchorFieldId
    : fieldIds[anchorIndex + 1] ?? null
}

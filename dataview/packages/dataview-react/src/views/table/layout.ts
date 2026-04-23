import type { RefObject } from 'react'
import type {
  FieldId
} from '@dataview/core/contracts'
import type {
  TableColumn
} from '@dataview/runtime'

export interface TableLayout {
  rowHeight: number
  headerHeight: number
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLDivElement | null>
}

export const MIN_COLUMN_WIDTH = 96
export const TABLE_REORDER_HANDLE_SIZE = 18
export const TABLE_REORDER_GUTTER_WIDTH = 36
export const TABLE_SELECTION_COLUMN_WIDTH = 36
export const TABLE_SELECTION_CHECKBOX_SIZE = 16

export const gridTemplate = (
  columns: readonly TableColumn[],
  widths?: ReadonlyMap<FieldId, number>
) => columns
  .map(column => `${Math.max(
    MIN_COLUMN_WIDTH,
    widths?.get(column.field.id) ?? column.width
  )}px`)
  .join(' ')

export const TABLE_TRAILING_ACTION_WIDTH = 116
export const TABLE_CELL_INLINE_PADDING = 8
export const TABLE_CELL_BLOCK_PADDING = 7.5
export const TABLE_HEADER_BLOCK_PADDING = 6

export interface ContentBounds {
  left: number
  right: number
}

interface BoundsInput {
  container: HTMLElement | null
  canvas: HTMLElement | null
}

const inlinePadding = (canvas: HTMLElement) => {
  const ownerWindow = canvas.ownerDocument.defaultView
  const style = ownerWindow?.getComputedStyle(canvas)
  return {
    left: Number.parseFloat(style?.paddingLeft ?? '0') || 0,
    right: Number.parseFloat(style?.paddingRight ?? '0') || 0
  }
}

export const contentBounds = (options: BoundsInput): ContentBounds | null => {
  if (!options.container || !options.canvas) {
    return null
  }

  const containerRect = options.container.getBoundingClientRect()
  const canvasRect = options.canvas.getBoundingClientRect()
  const padding = inlinePadding(options.canvas)
  return {
    left: canvasRect.left - containerRect.left + options.container.scrollLeft + padding.left,
    right: (
      canvasRect.left
      - containerRect.left
      + options.container.scrollLeft
      + Math.max(options.canvas.clientWidth, options.canvas.scrollWidth)
      - padding.right
    )
  }
}

export const gridContentBounds = (options: BoundsInput): ContentBounds | null => (
  contentBounds(options)
)

export const canvasContentOffset = (canvas: HTMLElement | null) => {
  if (!canvas) {
    return 0
  }

  return inlinePadding(canvas).left
}

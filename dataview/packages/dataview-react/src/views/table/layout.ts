import type { RefObject } from 'react'
import type { Field, FieldId } from '@dataview/core/contracts'

export interface TableLayout {
  rowHeight: number
  headerHeight: number
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLDivElement | null>
}

export const DEFAULT_COLUMN_WIDTH = 160
export const MIN_COLUMN_WIDTH = 96
export const TABLE_REORDER_HANDLE_SIZE = 18
export const TABLE_REORDER_GUTTER_WIDTH = 36
export const TABLE_SELECTION_COLUMN_WIDTH = 36
export const TABLE_SELECTION_CHECKBOX_SIZE = 16

const DEFAULT_WIDTHS_BY_KIND: Readonly<Record<Field['kind'], number>> = {
  title: 320,
  text: 240,
  url: 220,
  email: 220,
  phone: 180,
  status: 160,
  select: 160,
  multiSelect: 180,
  number: 140,
  date: 160,
  boolean: 96,
  asset: 200
}

export const resolveColumnWidth = (
  field: Field,
  widths?: ReadonlyMap<FieldId, number>
) => Math.max(
  MIN_COLUMN_WIDTH,
  widths?.get(field.id) ?? DEFAULT_WIDTHS_BY_KIND[field.kind] ?? DEFAULT_COLUMN_WIDTH
)

export const gridTemplate = (
  columns: readonly Field[],
  widths?: ReadonlyMap<FieldId, number>
) => columns
  .map(field => `${resolveColumnWidth(field, widths)}px`)
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

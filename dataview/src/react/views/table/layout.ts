import type { RefObject } from 'react'
import type { PropertyId, GroupProperty } from '@/core/contracts'

export interface TableLayout {
  rowHeight: number
  headerHeight: number
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLDivElement | null>
}

export const DEFAULT_COLUMN_WIDTH = 160
export const MIN_COLUMN_WIDTH = 96

export const gridTemplate = (
  columns: readonly GroupProperty[],
  widths?: ReadonlyMap<PropertyId, number>
) => columns
  .map(property => {
    const width = widths?.get(property.id)
    return width
      ? `${Math.max(MIN_COLUMN_WIDTH, width)}px`
      : `minmax(${DEFAULT_COLUMN_WIDTH}px, 1fr)`
  })
  .join(' ')

export const TABLE_REORDER_HANDLE_SIZE = 18
export const TABLE_REORDER_RAIL_WIDTH = 18
export const TABLE_REORDER_RAIL_GAP = 8
export const TABLE_SELECTION_SLOT_WIDTH = 16
const TABLE_SELECTION_OFFSET = 36
const TABLE_SELECTION_CENTER_OFFSET = TABLE_SELECTION_OFFSET / 2
const TABLE_REORDER_HANDLE_CENTER_OFFSET = (
  TABLE_SELECTION_CENTER_OFFSET
  + TABLE_SELECTION_SLOT_WIDTH / 2
  + TABLE_REORDER_RAIL_GAP
  + TABLE_REORDER_HANDLE_SIZE / 2
)
export const TABLE_SURFACE_LEADING_OFFSET = (
  TABLE_REORDER_HANDLE_CENTER_OFFSET
  + TABLE_REORDER_RAIL_WIDTH / 2
)

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
    right: canvasRect.left - containerRect.left + options.container.scrollLeft + options.canvas.clientWidth - padding.right
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

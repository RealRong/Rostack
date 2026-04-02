import {
  useMemo
} from 'react'
import { useViewportVersion } from '@dataview/react/dom/viewport'
import type { AppearanceId } from '@dataview/react/currentView'
import {
  scrollViewport
} from '@dataview/react/dom/scroll'
import { useTableContext } from '../context'

const DEFAULT_OVERSCAN = 360

export interface VirtualRow {
  index: number
  top: number
  rowId: AppearanceId
}

export interface VirtualRowsOptions {
  overscan?: number
}

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(max, value))

export const useVirtualRows = (
  rowIds: readonly AppearanceId[],
  options: VirtualRowsOptions = {}
) => {
  const table = useTableContext()
  const {
    rowHeight,
    headerHeight,
    canvasRef
  } = table.layout
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  const version = useViewportVersion(canvasRef)

  const totalHeight = rowIds.length * rowHeight

  const items = useMemo<readonly VirtualRow[]>(() => {
    const canvas = canvasRef.current
    if (!canvas || !rowIds.length) {
      return rowIds.map((rowId, index) => ({
        index,
        top: index * rowHeight,
        rowId
      }))
    }

    const viewport = scrollViewport(canvas)
    if (!viewport) {
      return rowIds.map((rowId, index) => ({
        index,
        top: index * rowHeight,
        rowId
      }))
    }

    const canvasRect = canvas.getBoundingClientRect()
    const rowsTop = canvasRect.top + headerHeight
    const start = Math.max(0, viewport.rect.top - rowsTop - overscan)
    const end = Math.max(0, viewport.rect.bottom - rowsTop + overscan)
    const startIndex = clamp(
      Math.floor(start / rowHeight),
      0,
      rowIds.length
    )
    const endIndex = clamp(
      Math.ceil(end / rowHeight),
      startIndex,
      rowIds.length
    )

    return rowIds.slice(startIndex, endIndex).map((rowId, offset) => {
      const index = startIndex + offset
      return {
        index,
        top: index * rowHeight,
        rowId
      }
    })
  }, [
    canvasRef,
    headerHeight,
    overscan,
    rowIds,
    rowHeight,
    totalHeight,
    version
  ])

  return {
    items,
    totalHeight
  }
}

import {
  useMemo
} from 'react'
import type {
  Section
} from '@dataview/react/runtime/currentView'
import { useViewportVersion } from '@dataview/react/dom/viewport'
import {
  scrollViewport
} from '@dataview/dom/scroll'
import { useTableContext } from '../context'

const DEFAULT_OVERSCAN = 360

export interface VirtualSection {
  index: number
  top: number
  height: number
  section: Section
}

export interface VirtualSectionsOptions {
  overscan?: number
  sections: readonly Section[]
}

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(max, value))

const findStartIndex = (
  offsets: readonly number[],
  heights: readonly number[],
  value: number
) => {
  let low = 0
  let high = offsets.length - 1
  let result = offsets.length

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const bottom = offsets[mid] + heights[mid]
    if (bottom >= value) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return result
}

const findEndIndex = (
  offsets: readonly number[],
  value: number
) => {
  let low = 0
  let high = offsets.length - 1
  let result = offsets.length

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid] >= value) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return result
}

export const sectionHeight = (input: {
  section: Section
  rowHeight: number
  headerHeight: number
}): number => input.section.collapsed
  ? input.headerHeight
  : (
      input.headerHeight
      + input.headerHeight
      + (input.section.ids.length * input.rowHeight)
    )

export const useVirtualSections = (
  options: VirtualSectionsOptions
) => {
  const table = useTableContext()
  const {
    rowHeight,
    headerHeight,
    canvasRef
  } = table.layout
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  const version = useViewportVersion(canvasRef)

  const heights = useMemo(
    () => options.sections.map(section => sectionHeight({
      section,
      rowHeight,
      headerHeight
    })),
    [headerHeight, options.sections, rowHeight]
  )
  const offsets = useMemo(() => {
    const next: number[] = []
    let top = 0
    heights.forEach(height => {
      next.push(top)
      top += height
    })
    return next
  }, [heights])
  const totalHeight = heights.reduce((sum, height) => sum + height, 0)

  const items = useMemo<readonly VirtualSection[]>(() => {
    const canvas = canvasRef.current
    if (!canvas || !options.sections.length) {
      return options.sections.map((section, index) => ({
        index,
        top: offsets[index] ?? 0,
        height: heights[index] ?? 0,
        section
      }))
    }

    const viewport = scrollViewport(canvas)
    if (!viewport) {
      return options.sections.map((section, index) => ({
        index,
        top: offsets[index] ?? 0,
        height: heights[index] ?? 0,
        section
      }))
    }

    const canvasRect = canvas.getBoundingClientRect()
    const start = Math.max(0, viewport.rect.top - canvasRect.top - overscan)
    const end = Math.max(0, viewport.rect.bottom - canvasRect.top + overscan)
    const startIndex = clamp(
      findStartIndex(offsets, heights, start),
      0,
      options.sections.length
    )
    const endIndex = clamp(
      findEndIndex(offsets, end),
      startIndex,
      options.sections.length
    )

    return options.sections
      .slice(startIndex, endIndex)
      .map((section, offset) => {
        const index = startIndex + offset
        return {
          index,
          top: offsets[index] ?? 0,
          height: heights[index] ?? 0,
          section
        }
      })
  }, [
    canvasRef,
    heights,
    offsets,
    options.sections,
    overscan,
    totalHeight,
    version
  ])

  return {
    items,
    totalHeight
  }
}

import {
  useMemo,
  type RefObject
} from 'react'
import { useViewportVersion } from '@dataview/react/dom/viewport'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import {
  useMeasuredHeights
} from '@dataview/react/virtual'

const DEFAULT_CARD_HEIGHT = 96
const DEFAULT_GAP = 8
const DEFAULT_OVERSCAN = 360

interface VirtualCardLayout {
  id: AppearanceId
  top: number
  height: number
}

interface Options {
  ids: readonly AppearanceId[]
  bodyRef: RefObject<HTMLElement | null>
  estimatedHeight?: number
  gap?: number
  overscan?: number
}

const findStartIndex = (
  items: readonly VirtualCardLayout[],
  start: number
) => {
  let low = 0
  let high = items.length - 1
  let answer = items.length

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const item = items[middle]
    if (item && item.top + item.height >= start) {
      answer = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return answer
}

const findEndIndex = (
  items: readonly VirtualCardLayout[],
  end: number
) => {
  let low = 0
  let high = items.length - 1
  let answer = items.length

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const item = items[middle]
    if (item && item.top <= end) {
      low = middle + 1
      answer = low
    } else {
      high = middle - 1
    }
  }

  return answer
}

export const useColumnVirtual = (options: Options) => {
  const estimatedHeight = options.estimatedHeight ?? DEFAULT_CARD_HEIGHT
  const gap = options.gap ?? DEFAULT_GAP
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  const viewportVersion = useViewportVersion(options.bodyRef)
  const measured = useMeasuredHeights({
    ids: options.ids
  })

  const items = useMemo<readonly VirtualCardLayout[]>(() => {
    let top = 0

    return options.ids.map((id, index) => {
      const height = measured.heightById.get(id) ?? estimatedHeight
      const item: VirtualCardLayout = {
        id,
        top,
        height
      }

      top += height + (index < options.ids.length - 1 ? gap : 0)
      return item
    })
  }, [estimatedHeight, gap, measured.heightById, options.ids])

  const totalHeight = useMemo(
    () => items.length ? items[items.length - 1]!.top + items[items.length - 1]!.height : 0,
    [items]
  )

  const visibleItems = useMemo(() => {
    const bodyNode = options.bodyRef.current
    if (!bodyNode || !items.length || typeof window === 'undefined') {
      return items
    }

    const rect = bodyNode.getBoundingClientRect()
    const start = Math.max(0, -rect.top - overscan)
    const end = Math.max(0, window.innerHeight - rect.top + overscan)
    const startIndex = findStartIndex(items, start)
    const endIndex = Math.max(startIndex, findEndIndex(items, end))

    return items.slice(startIndex, endIndex)
  }, [items, options.bodyRef, overscan, totalHeight, viewportVersion])

  const layouts = useMemo<readonly VirtualCardLayout[]>(
    () => items.map(item => ({
      id: item.id,
      top: item.top,
      height: item.height
    })),
    [items]
  )

  const positionById = useMemo(
    () => new Map(layouts.map(item => [item.id, item] as const)),
    [layouts]
  )

  return {
    items: visibleItems,
    layouts,
    positionById,
    totalHeight,
    measure: measured.measure
  }
}

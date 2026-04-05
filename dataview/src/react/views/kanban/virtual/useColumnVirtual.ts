import {
  useMemo,
  type RefObject
} from 'react'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import {
  useMeasuredHeights,
  useVirtualBlocks,
  type VirtualBlock
} from '@dataview/react/virtual'

const DEFAULT_CARD_HEIGHT = 96
const DEFAULT_GAP = 8
const DEFAULT_OVERSCAN = 960

interface VirtualCardLayout extends VirtualBlock {
  id: AppearanceId
}

interface Options {
  ids: readonly AppearanceId[]
  bodyRef: RefObject<HTMLElement | null>
  estimatedHeight?: number
  gap?: number
  overscan?: number
}

const resolveEstimatedHeight = (
  heightById: ReadonlyMap<AppearanceId, number>,
  fallback: number
) => {
  const values = Array.from(heightById.values())
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)

  if (!values.length) {
    return fallback
  }

  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? Math.round((values[middle - 1] + values[middle]) / 2)
    : values[middle]
}

export const useColumnVirtual = (options: Options) => {
  const gap = options.gap ?? DEFAULT_GAP
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  const measured = useMeasuredHeights({
    ids: options.ids
  })
  const estimatedHeight = useMemo(
    () => resolveEstimatedHeight(
      measured.heightById,
      options.estimatedHeight ?? DEFAULT_CARD_HEIGHT
    ),
    [measured.heightById, options.estimatedHeight]
  )

  const items = useMemo<readonly VirtualCardLayout[]>(() => {
    let top = 0

    return options.ids.map((id, index) => {
      const height = measured.heightById.get(id) ?? estimatedHeight
      const item: VirtualCardLayout = {
        key: id,
        id,
        top,
        height
      }

      top += height + (index < options.ids.length - 1 ? gap : 0)
      return item
    })
  }, [estimatedHeight, gap, measured.heightById, options.ids])
  const virtual = useVirtualBlocks({
    blocks: items,
    canvasRef: options.bodyRef,
    overscan
  })

  const layouts = useMemo<readonly VirtualCardLayout[]>(
    () => items.map(item => ({
      key: item.key,
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
    items: virtual.items,
    layouts,
    positionById,
    totalHeight: virtual.totalHeight,
    measure: measured.measure
  }
}

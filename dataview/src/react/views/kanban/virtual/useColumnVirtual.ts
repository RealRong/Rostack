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
const DEFAULT_OVERSCAN = 360

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

export const useColumnVirtual = (options: Options) => {
  const estimatedHeight = options.estimatedHeight ?? DEFAULT_CARD_HEIGHT
  const gap = options.gap ?? DEFAULT_GAP
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  const measured = useMeasuredHeights({
    ids: options.ids
  })

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

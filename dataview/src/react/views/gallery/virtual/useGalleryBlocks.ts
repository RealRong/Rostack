import {
  useEffect,
  useMemo,
  useReducer,
  type RefObject
} from 'react'
import type {
  Section
} from '@dataview/react/runtime/currentView'
import {
  readInlineInsets,
  useMeasuredHeights,
  useVirtualBlocks
} from '@dataview/react/virtual'
import {
  buildGalleryLayout,
  GALLERY_CARD_ESTIMATED_HEIGHT,
  GALLERY_CARD_GAP,
  resolveGalleryGridMetrics
} from './layout'

const resolveEstimatedHeight = (
  heightById: ReadonlyMap<string, number>,
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
    ? Math.round((values[middle - 1]! + values[middle]!) / 2)
    : values[middle]!
}

export const useGalleryBlocks = (input: {
  grouped: boolean
  sections: readonly Section[]
  minCardWidth: number
  containerRef: RefObject<HTMLDivElement | null>
  overscan?: number
}) => {
  const [containerVersion, bumpContainerVersion] = useReducer((value: number) => value + 1, 0)
  const ids = useMemo(
    () => input.sections.flatMap(section => section.ids),
    [input.sections]
  )

  useEffect(() => {
    const node = input.containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      bumpContainerVersion()
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [input.containerRef])

  const metrics = useMemo(() => {
    const container = input.containerRef.current
    const inset = readInlineInsets(container)
    const containerWidth = container?.clientWidth ?? input.minCardWidth
    const grid = resolveGalleryGridMetrics({
      containerWidth,
      contentInsetLeft: inset.left,
      contentInsetRight: inset.right,
      minCardWidth: input.minCardWidth,
      gap: GALLERY_CARD_GAP
    })

    return {
      width: containerWidth,
      insetLeft: inset.left,
      insetRight: inset.right,
      columnCount: grid.columnCount,
      cardWidth: grid.cardWidth,
      measuredWidth: Math.max(1, Math.round(grid.cardWidth))
    }
  }, [
    containerVersion,
    input.minCardWidth,
    input.containerRef
  ])
  const measured = useMeasuredHeights({
    ids,
    bucketKey: metrics.measuredWidth
  })
  const estimatedHeight = useMemo(
    () => resolveEstimatedHeight(measured.heightById, GALLERY_CARD_ESTIMATED_HEIGHT),
    [measured.heightById]
  )

  const layout = useMemo(() => buildGalleryLayout({
    grouped: input.grouped,
    sections: input.sections,
    containerWidth: metrics.width,
    contentInsetLeft: metrics.insetLeft,
    contentInsetRight: metrics.insetRight,
    minCardWidth: input.minCardWidth,
    gap: GALLERY_CARD_GAP,
    estimatedHeight,
    heightById: measured.heightById
  }), [
    estimatedHeight,
    input.grouped,
    input.minCardWidth,
    input.sections,
    measured.heightById,
    metrics.insetLeft,
    metrics.insetRight,
    metrics.width
  ])

  const virtual = useVirtualBlocks({
    blocks: layout.blocks,
    canvasRef: input.containerRef,
    overscan: input.overscan
  })

  return {
    layout,
    blocks: virtual.items,
    totalHeight: layout.totalHeight,
    measure: measured.measure
  }
}

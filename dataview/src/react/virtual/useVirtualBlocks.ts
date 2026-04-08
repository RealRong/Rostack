import { useMemo } from 'react'
import type { RefObject } from 'react'
import {
  scrollViewport
} from '@shared/dom'
import {
  useViewportVersion
} from '@dataview/react/dom/viewport'
import {
  findVirtualBlockEndIndex,
  findVirtualBlockStartIndex
} from './math'
import type {
  VirtualBlock
} from './types'

const DEFAULT_OVERSCAN = 480

export interface UseVirtualBlocksOptions<TBlock extends VirtualBlock> {
  blocks: readonly TBlock[]
  canvasRef: RefObject<HTMLElement | null>
  overscan?: number
}

export interface UseVirtualBlocksResult<TBlock extends VirtualBlock> {
  items: readonly TBlock[]
  totalHeight: number
}

const resolveInitialViewportHeight = () => (
  typeof window !== 'undefined'
    ? Math.max(0, window.innerHeight)
    : DEFAULT_OVERSCAN
)

export const useVirtualBlocks = <TBlock extends VirtualBlock>(
  options: UseVirtualBlocksOptions<TBlock>
): UseVirtualBlocksResult<TBlock> => {
  const overscan = options.overscan ?? DEFAULT_OVERSCAN
  const viewportVersion = useViewportVersion(options.canvasRef)
  const totalHeight = options.blocks.length
    ? (
      options.blocks[options.blocks.length - 1]!.top
      + options.blocks[options.blocks.length - 1]!.height
    )
    : 0

  const items = useMemo(() => {
    if (!options.blocks.length) {
      return options.blocks
    }

    const canvas = options.canvasRef.current
    if (!canvas) {
      return options.blocks.slice(
        0,
        Math.max(
          1,
          findVirtualBlockEndIndex(
            options.blocks,
            resolveInitialViewportHeight() + overscan
          )
        )
      )
    }

    const viewport = scrollViewport(canvas)
    if (!viewport) {
      return options.blocks.slice(
        0,
        Math.max(
          1,
          findVirtualBlockEndIndex(
            options.blocks,
            resolveInitialViewportHeight() + overscan
          )
        )
      )
    }

    const canvasRect = canvas.getBoundingClientRect()
    const start = Math.max(0, viewport.rect.top - canvasRect.top - overscan)
    const end = Math.max(0, viewport.rect.bottom - canvasRect.top + overscan)
    const startIndex = findVirtualBlockStartIndex(options.blocks, start)
    const endIndex = Math.max(startIndex, findVirtualBlockEndIndex(options.blocks, end))

    return options.blocks.slice(startIndex, endIndex)
  }, [
    options.blocks,
    options.canvasRef,
    overscan,
    totalHeight,
    viewportVersion
  ])

  return {
    items,
    totalHeight
  }
}

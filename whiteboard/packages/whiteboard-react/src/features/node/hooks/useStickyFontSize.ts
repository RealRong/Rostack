import { useMemo, type RefObject } from 'react'
import type { Rect } from '@whiteboard/core/types'
import { estimateTextAutoFont } from '@whiteboard/core/node'
import { measureStickyFontSize } from '../dom/stickyTextFit'

export const useStickyFontSize = ({
  text,
  rect,
  sourceRef
}: {
  text: string
  rect: Rect
  sourceRef: RefObject<HTMLElement | null>
}) => {
  return useMemo(() => {
    const fallback = estimateTextAutoFont('sticky', rect)
    const source = sourceRef.current
    if (!source) {
      return fallback
    }

    return measureStickyFontSize({
      text,
      rect,
      source
    })
  }, [
    rect.height,
    rect.width,
    sourceRef,
    text
  ])
}

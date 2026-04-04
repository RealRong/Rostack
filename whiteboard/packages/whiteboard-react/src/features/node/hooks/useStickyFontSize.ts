import { useEffect, useState, type RefObject } from 'react'
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
  const fallback = estimateTextAutoFont('sticky', rect)
  const [fontSize, setFontSize] = useState(fallback)

  useEffect(() => {
    const source = sourceRef.current
    if (!source) {
      setFontSize((current) => current === fallback ? current : fallback)
      return
    }

    const next = measureStickyFontSize({
      text,
      rect,
      source
    })
    setFontSize((current) => current === next ? current : next)
  }, [fallback, rect, sourceRef, text])

  return fontSize
}

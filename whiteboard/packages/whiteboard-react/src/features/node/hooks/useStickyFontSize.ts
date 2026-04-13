import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from 'react'
import type { Rect } from '@whiteboard/core/types'
import { estimateTextAutoFont } from '@whiteboard/core/node'
import { measureStickyFontSize } from '#whiteboard-react/features/node/dom/stickyTextFit'

export const useStickyFontSize = ({
  text,
  rect,
  source,
  frame
}: {
  text: string
  rect: Rect
  source: HTMLElement | null
  frame: HTMLElement | null
}) => {
  const fallback = useMemo(() => estimateTextAutoFont('sticky', rect), [
    rect.height,
    rect.width
  ])
  const [fontSize, setFontSize] = useState(fallback)

  useLayoutEffect(() => {
    if (!text.trim()) {
      setFontSize((current) => current === fallback ? current : fallback)
      return
    }

    if (!source || !frame) {
      return
    }

    const next = measureStickyFontSize({
      text,
      rect,
      source,
      frame,
      maxFontSize: fallback
    })

    setFontSize((current) => current === next ? current : next)
  }, [
    fallback,
    frame,
    rect,
    source,
    text
  ])

  useEffect(() => {
    if (
      typeof ResizeObserver === 'undefined'
      || !source
      || !frame
    ) {
      return
    }

    const update = () => {
      const next = measureStickyFontSize({
        text,
        rect,
        source,
        frame,
        maxFontSize: fallback
      })
      setFontSize((current) => current === next ? current : next)
    }
    const observer = new ResizeObserver(() => {
      update()
    })

    observer.observe(source)
    if (frame !== source) {
      observer.observe(frame)
    }

    return () => {
      observer.disconnect()
    }
  }, [
    fallback,
    frame,
    rect,
    source,
    text
  ])

  return fontSize
}

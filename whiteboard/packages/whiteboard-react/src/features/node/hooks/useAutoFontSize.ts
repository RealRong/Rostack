import { useEffect, useMemo, useState, type RefObject } from 'react'
import type { Rect } from '@whiteboard/core/types'
import { useEditorRuntime } from '../../../runtime/hooks/useEditor'
import {
  TEXT_DEFAULT_FONT_SIZE,
  type TextVariant,
  createTextAutoFontTask,
  estimateTextAutoFont,
  scheduleTextAutoFont
} from '../text'

const isVisibleInViewport = ({
  left,
  top,
  right,
  bottom,
  viewportWidth,
  viewportHeight
}: {
  left: number
  top: number
  right: number
  bottom: number
  viewportWidth: number
  viewportHeight: number
}) => {
  const margin = 200
  return (
    right >= -margin
    && bottom >= -margin
    && left <= viewportWidth + margin
    && top <= viewportHeight + margin
  )
}

export const useAutoFontSize = ({
  text,
  placeholder,
  rect,
  variant,
  manualFontSize,
  sourceRef
}: {
  text: string
  placeholder: string
  rect: Rect
  variant: TextVariant
  manualFontSize?: number
  sourceRef: RefObject<HTMLElement | null>
}) => {
  const editor = useEditorRuntime()
  const initialAutoFontSize = useMemo(
    () => estimateTextAutoFont({
      variant,
      rect
    }),
    [rect, variant]
  )
  const [resolved, setResolved] = useState<number>(
    manualFontSize ?? initialAutoFontSize
  )

  useEffect(() => {
    if (manualFontSize !== undefined) {
      setResolved(manualFontSize)
      return
    }

    if (variant === 'text') {
      setResolved(TEXT_DEFAULT_FONT_SIZE)
      return
    }

    const source = sourceRef.current
    if (!source) {
      setResolved(initialAutoFontSize)
      return
    }

    const task = createTextAutoFontTask({
      text,
      placeholder,
      source,
      variant
    })
    if (!task) {
      setResolved(initialAutoFontSize)
      return
    }

    if (!task.hasContent) {
      setResolved((current) => current === task.initial ? current : task.initial)
      return
    }

    const viewportSize = editor.read.viewport.size()
    const topLeft = editor.read.viewport.worldToScreen({
      x: rect.x,
      y: rect.y
    })
    const bottomRight = editor.read.viewport.worldToScreen({
      x: rect.x + rect.width,
      y: rect.y + rect.height
    })
    const priority = isVisibleInViewport({
      left: topLeft.x,
      top: topLeft.y,
      right: bottomRight.x,
      bottom: bottomRight.y,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height
    })
      ? 0
      : 1

    setResolved((current) => current === task.initial ? current : task.initial)

    return scheduleTextAutoFont(task, priority, (fontSize) => {
      setResolved((current) => current === fontSize ? current : fontSize)
    })
  }, [
    initialAutoFontSize,
    editor,
    manualFontSize,
    placeholder,
    rect,
    sourceRef,
    text,
    variant
  ])

  return manualFontSize ?? resolved
}

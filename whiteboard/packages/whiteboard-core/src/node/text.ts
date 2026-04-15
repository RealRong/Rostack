import type { Rect } from '@whiteboard/core/types'
import type { ResizeDirection } from '@whiteboard/core/node/transform'

export type TextVariant = 'text' | 'sticky'
export type TextWidthMode = 'auto' | 'wrap'
export type TextHandleMode = 'none' | 'reflow' | 'scale'
export type StickyFontMode = 'auto' | 'fixed'

export type TextContentBox = {
  width: number
  height: number
}

export type TextFrameMetrics = {
  width: number
  height: number
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  borderTop: number
  borderRight: number
  borderBottom: number
  borderLeft: number
}

export type TextAutoFont = {
  min: number
  max: number
  initial: number
}

export const TEXT_DEFAULT_FONT_SIZE = 14
export const TEXT_FIT_VERTICAL_MARGIN = 2
export const TEXT_LAYOUT_MIN_WIDTH = 24
export const TEXT_AUTO_MIN_WIDTH = 56
export const TEXT_AUTO_MAX_WIDTH = 360
export const TEXT_RESIZE_HANDLES = ['nw', 'ne', 'e', 'se', 'sw', 'w'] as const satisfies readonly ResizeDirection[]

const TEXT_WIDTH_MODE_KEY = 'widthMode'
const TEXT_WRAP_WIDTH_KEY = 'wrapWidth'
const STICKY_FONT_MODE_KEY = 'fontMode'

const clampBoxSize = (
  size: number
) => Math.max(1, size)

const clampFontSize = (
  size: number,
  min: number,
  max: number
) => Math.max(min, Math.min(max, size))

const readFrameInset = (
  variant: TextVariant
) => ({
  padding: variant === 'sticky' ? 16 : 0,
  border: 1
})

export const isTextNode = <
  TNode extends {
    type: string
    data?: Record<string, unknown>
  }
>(
  node: TNode
): node is TNode & { type: 'text' } => node.type === 'text'

export const readTextWidthMode = (
  node: {
    type: string
    data?: Record<string, unknown>
  }
): TextWidthMode => (
  isTextNode(node) && node.data?.[TEXT_WIDTH_MODE_KEY] === 'wrap'
    ? 'wrap'
    : 'auto'
)

export const setTextWidthMode = <
  TData extends Record<string, unknown> | undefined
>(
  node: {
    data?: TData
  },
  mode: TextWidthMode
) => ({
  ...(node.data ?? {}),
  [TEXT_WIDTH_MODE_KEY]: mode
})

export const readTextWrapWidth = (
  node: {
    type: string
    data?: Record<string, unknown>
  }
) => (
  isTextNode(node) && typeof node.data?.[TEXT_WRAP_WIDTH_KEY] === 'number'
    ? node.data[TEXT_WRAP_WIDTH_KEY] as number
    : undefined
)

export const setTextWrapWidth = <
  TData extends Record<string, unknown> | undefined
>(
  node: {
    data?: TData
  },
  width?: number
) => ({
  ...(node.data ?? {}),
  [TEXT_WRAP_WIDTH_KEY]: width
})

export const readStickyFontMode = (
  node: {
    type: string
    data?: Record<string, unknown>
  }
): StickyFontMode => (
  node.type === 'sticky' && node.data?.[STICKY_FONT_MODE_KEY] === 'fixed'
    ? 'fixed'
    : 'auto'
)

export const setStickyFontMode = <
  TData extends Record<string, unknown> | undefined
>(
  node: {
    data?: TData
  },
  mode: StickyFontMode
) => ({
  ...(node.data ?? {}),
  [STICKY_FONT_MODE_KEY]: mode
})

export const isTextContentEmpty = (
  value: string
) => value.trim().length === 0

export const resolveTextBox = (
  variant: TextVariant,
  rect: Rect
): TextContentBox => {
  const inset = readFrameInset(variant)
  const horizontalInset = inset.padding * 2 + inset.border * 2
  const verticalInset = inset.padding * 2 + inset.border * 2

  return {
    width: clampBoxSize(rect.width - horizontalInset),
    height: clampBoxSize(rect.height - verticalInset - TEXT_FIT_VERTICAL_MARGIN)
  }
}

export const resolveTextContentBox = (
  metrics: TextFrameMetrics
): TextContentBox => ({
  width: clampBoxSize(
    metrics.width - metrics.paddingLeft - metrics.paddingRight - metrics.borderLeft - metrics.borderRight
  ),
  height: clampBoxSize(
    metrics.height - metrics.paddingTop - metrics.paddingBottom - metrics.borderTop - metrics.borderBottom - TEXT_FIT_VERTICAL_MARGIN
  )
})

export const resolveTextAutoFont = (
  variant: TextVariant,
  box: TextContentBox
): TextAutoFont => {
  const min = variant === 'sticky' ? 12 : 10
  const maxLimit = variant === 'sticky' ? 40 : 32
  const estimatedMax = variant === 'sticky'
    ? Math.floor(Math.min(box.height * 0.36, box.width * 0.22))
    : Math.floor(box.height * 0.68)
  const max = clampFontSize(Math.max(min, estimatedMax), min, maxLimit)
  const estimated = variant === 'sticky'
    ? Math.round(Math.min(box.height * 0.22, box.width * 0.18))
    : Math.round(box.height * 0.48)

  return {
    min,
    max,
    initial: clampFontSize(estimated, min, max)
  }
}

export const resolveTextHandle = (
  handle: ResizeDirection
): TextHandleMode => {
  if (handle === 'e' || handle === 'w') {
    return 'reflow'
  }

  if (handle === 'n' || handle === 's') {
    return 'none'
  }

  return 'scale'
}

export const estimateTextAutoFont = (
  variant: TextVariant,
  rect: Rect
) => (
  variant === 'text'
    ? TEXT_DEFAULT_FONT_SIZE
    : resolveTextAutoFont(
        variant,
        resolveTextBox(variant, rect)
      ).initial
)

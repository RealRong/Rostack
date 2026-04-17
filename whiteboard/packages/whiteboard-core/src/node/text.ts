import type { Rect, Size } from '@whiteboard/core/types'
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

export type TextFrameInsets = Omit<TextFrameMetrics, 'width' | 'height'>

export type TextAutoFont = {
  min: number
  max: number
  initial: number
}

export type TextLayoutInput = {
  nodeId?: string
  text: string
  widthMode: TextWidthMode
  wrapWidth?: number
  fontSize: number
  fontWeight?: number | string
  fontStyle?: string
  frame: TextFrameInsets
  minWidth?: number
  maxWidth?: number
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

const readNumberStyle = (
  node: {
    style?: Record<string, unknown>
  },
  key: string
) => {
  const value = node.style?.[key]
  return typeof value === 'number' ? value : undefined
}

const readStringStyle = (
  node: {
    style?: Record<string, unknown>
  },
  key: string
) => {
  const value = node.style?.[key]
  return typeof value === 'string' ? value : undefined
}

const readPositiveStyleNumber = (
  node: {
    style?: Record<string, unknown>
  },
  key: string
) => {
  const value = readNumberStyle(node, key)
  return typeof value === 'number' && value > 0
    ? value
    : undefined
}

export const readTextFrameInsets = (
  node: {
    type: string
    style?: Record<string, unknown>
  }
): TextFrameInsets => {
  if (node.type !== 'text') {
    return {
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      borderTop: 0,
      borderRight: 0,
      borderBottom: 0,
      borderLeft: 0
    }
  }

  const paddingX = Math.max(0, readNumberStyle(node, 'paddingX') ?? 0)
  const paddingY = Math.max(0, readNumberStyle(node, 'paddingY') ?? 0)
  const strokeWidth = Math.max(0, readNumberStyle(node, 'strokeWidth') ?? 0)
  const frameKind = readStringStyle(node, 'frameKind')
  const underline = frameKind === 'underline'

  return {
    paddingTop: paddingY,
    paddingRight: paddingX,
    paddingBottom: paddingY,
    paddingLeft: paddingX,
    borderTop: underline ? 0 : strokeWidth,
    borderRight: underline ? 0 : strokeWidth,
    borderBottom: strokeWidth,
    borderLeft: underline ? 0 : strokeWidth
  }
}

export const resolveTextFrameMetrics = (input: {
  node: {
    type: string
    style?: Record<string, unknown>
  }
  width: number
  height: number
}): TextFrameMetrics => ({
  width: input.width,
  height: input.height,
  ...readTextFrameInsets(input.node)
})

export const readTextComputedSize = (
  node: {
    type: string
    size?: Size
  },
  fallback?: Size
): Size | undefined => {
  if (node.type !== 'text') {
    return fallback
  }

  const width = node.size?.width
  const height = node.size?.height

  return (
    typeof width === 'number'
    && width > 0
    && typeof height === 'number'
    && height > 0
  )
    ? {
        width,
        height
      }
    : fallback
}

export const readTextLayoutInput = (
  node: {
    id?: string
    type: string
    size?: Size
    data?: Record<string, unknown>
    style?: Record<string, unknown>
  },
  fallback?: Size
): TextLayoutInput | undefined => {
  if (node.type !== 'text') {
    return undefined
  }

  const widthMode = readTextWidthMode(node)
  const computedSize = readTextComputedSize(node, fallback)
  const wrapWidth = widthMode === 'wrap'
    ? (
        readTextWrapWidth(node)
        ?? computedSize?.width
      )
    : undefined

  return {
    nodeId: node.id,
    text: typeof node.data?.text === 'string'
      ? node.data.text
      : '',
    widthMode,
    wrapWidth,
    fontSize: readNumberStyle(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE,
    fontWeight: (() => {
      const value = node.style?.fontWeight
      return (
        typeof value === 'number'
        || typeof value === 'string'
      )
        ? value
        : undefined
    })(),
    fontStyle: readStringStyle(node, 'fontStyle'),
    frame: readTextFrameInsets(node),
    minWidth: readPositiveStyleNumber(node, 'minWidth'),
    maxWidth: readPositiveStyleNumber(node, 'maxWidth')
  }
}

export const buildTextLayoutKey = (
  input: Omit<TextLayoutInput, 'nodeId'>
): string => JSON.stringify(input)

export const shouldPatchTextLayout = (
  node: {
    type: string
    size?: Size
  },
  nextSize: Size
): boolean => {
  const current = readTextComputedSize(node)
  return !(
    current
    && current.width === nextSize.width
    && current.height === nextSize.height
  )
}

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

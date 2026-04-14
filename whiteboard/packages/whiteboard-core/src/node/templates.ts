import type { Size, SpatialNodeInput } from '@whiteboard/core/types'
import { readTextWrapWidth } from '@whiteboard/core/node/text'

export const TEXT_START_SIZE = {
  width: 144,
  height: 24
} as const

export const STICKY_SQUARE_SIZE = {
  width: 180,
  height: 180
} as const

export const STICKY_RECTANGLE_SIZE = {
  width: 240,
  height: 120
} as const

export const STICKY_START_SIZE = STICKY_SQUARE_SIZE

export const TEXT_PLACEHOLDER = 'Text'
export const STICKY_PLACEHOLDER = 'Sticky'
export const STICKY_DEFAULT_FILL = 'var(--ui-yellow-surface-pressed)'
export const STICKY_DEFAULT_TEXT_COLOR = 'var(--ui-text-primary)'
export const STICKY_DEFAULT_STROKE = 'rgb(from var(--ui-text-primary) r g b / 0.12)'
export const STICKY_DEFAULT_STROKE_WIDTH = 1

export const FRAME_START_SIZE = {
  width: 520,
  height: 320
} as const

export const FRAME_DEFAULT_TITLE = 'Frame'
export const FRAME_DEFAULT_FILL = 'transparent'
export const FRAME_DEFAULT_STROKE = 'var(--ui-border-strong)'
export const FRAME_DEFAULT_TEXT_COLOR = 'var(--ui-text-secondary)'
export const FRAME_DEFAULT_STROKE_WIDTH = 1

const isFinitePositive = (
  value: unknown
): value is number => typeof value === 'number'
  && Number.isFinite(value)
  && value > 0

const resolveExplicitSize = (
  size: SpatialNodeInput['size']
): Size | undefined => {
  if (!size) {
    return undefined
  }

  const width = isFinitePositive(size.width) ? size.width : undefined
  const height = isFinitePositive(size.height) ? size.height : undefined

  if (width === undefined || height === undefined) {
    return undefined
  }

  return {
    width,
    height
  }
}

export const resolveTextNodeBootstrapSize = (
  node: Pick<SpatialNodeInput, 'size' | 'data'>
): Size => ({
  width: isFinitePositive(node.size?.width)
    ? node.size.width
    : (readTextWrapWidth({
        type: 'text',
        data: node.data
      }) ?? TEXT_START_SIZE.width),
  height: isFinitePositive(node.size?.height)
    ? node.size.height
    : TEXT_START_SIZE.height
})

export const resolveNodeBootstrapSize = (
  node: Pick<SpatialNodeInput, 'type' | 'size' | 'data'>
): Size | undefined => {
  if (node.type === 'text') {
    return resolveTextNodeBootstrapSize(node)
  }

  return resolveExplicitSize(node.size)
}

export const createTextNodeInput = (): Omit<SpatialNodeInput, 'position'> => ({
  type: 'text',
  data: { text: '' }
})

export const createStickyNodeInput = ({
  fill = STICKY_DEFAULT_FILL,
  size = STICKY_START_SIZE
}: {
  fill?: string
  size?: {
    width: number
    height: number
  }
} = {}): Omit<SpatialNodeInput, 'position'> => ({
  type: 'sticky',
  size: { ...size },
  data: {
    text: ''
  },
  style: {
    fill,
    color: STICKY_DEFAULT_TEXT_COLOR,
    stroke: STICKY_DEFAULT_STROKE,
    strokeWidth: STICKY_DEFAULT_STROKE_WIDTH
  }
})

export const createFrameNodeInput = (): Omit<SpatialNodeInput, 'position'> => ({
  type: 'frame',
  size: { ...FRAME_START_SIZE },
  data: {
    title: FRAME_DEFAULT_TITLE
  },
  style: {
    fill: FRAME_DEFAULT_FILL,
    stroke: FRAME_DEFAULT_STROKE,
    strokeWidth: FRAME_DEFAULT_STROKE_WIDTH,
    color: FRAME_DEFAULT_TEXT_COLOR
  }
})

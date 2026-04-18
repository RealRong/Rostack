import type { NodeTemplate, SpatialNodeInput } from '@whiteboard/core/types'
import { readTextWrapWidth } from '@whiteboard/core/node/text'
import {
  WHITEBOARD_FRAME_DEFAULTS,
  WHITEBOARD_STICKY_DEFAULTS
} from '@whiteboard/product/palette'

export const WHITEBOARD_TEXT_START_SIZE = {
  width: 144,
  height: 20
} as const

export const WHITEBOARD_STICKY_SQUARE_SIZE = {
  width: 180,
  height: 180
} as const

export const WHITEBOARD_STICKY_RECTANGLE_SIZE = {
  width: 240,
  height: 120
} as const

export const WHITEBOARD_STICKY_START_SIZE = WHITEBOARD_STICKY_SQUARE_SIZE

export const WHITEBOARD_TEXT_PLACEHOLDER = 'Text'
export const WHITEBOARD_STICKY_PLACEHOLDER = 'Sticky'
export const WHITEBOARD_STICKY_DEFAULT_FILL = WHITEBOARD_STICKY_DEFAULTS.fill
export const WHITEBOARD_STICKY_DEFAULT_TEXT_COLOR = WHITEBOARD_STICKY_DEFAULTS.color
export const WHITEBOARD_STICKY_DEFAULT_STROKE = WHITEBOARD_STICKY_DEFAULTS.stroke
export const WHITEBOARD_STICKY_DEFAULT_STROKE_WIDTH = WHITEBOARD_STICKY_DEFAULTS.strokeWidth

export const WHITEBOARD_FRAME_START_SIZE = {
  width: 520,
  height: 320
} as const

export const WHITEBOARD_FRAME_DEFAULT_TITLE = 'Frame'
export const WHITEBOARD_FRAME_DEFAULT_FILL = WHITEBOARD_FRAME_DEFAULTS.fill
export const WHITEBOARD_FRAME_DEFAULT_STROKE = WHITEBOARD_FRAME_DEFAULTS.stroke
export const WHITEBOARD_FRAME_DEFAULT_TEXT_COLOR = WHITEBOARD_FRAME_DEFAULTS.color
export const WHITEBOARD_FRAME_DEFAULT_STROKE_WIDTH = WHITEBOARD_FRAME_DEFAULTS.strokeWidth

const isFinitePositive = (
  value: unknown
): value is number => typeof value === 'number'
  && Number.isFinite(value)
  && value > 0

export const resolveWhiteboardTextBootstrapSize = (
  node: Pick<SpatialNodeInput, 'size' | 'data'>
) => ({
  width: isFinitePositive(node.size?.width)
    ? node.size.width
    : (readTextWrapWidth({
        type: 'text',
        data: node.data
      }) ?? WHITEBOARD_TEXT_START_SIZE.width),
  height: isFinitePositive(node.size?.height)
    ? node.size.height
    : WHITEBOARD_TEXT_START_SIZE.height
})

export const createWhiteboardTextTemplate = (): NodeTemplate => ({
  type: 'text',
  data: { text: '' }
})

export const createWhiteboardStickyTemplate = ({
  fill = WHITEBOARD_STICKY_DEFAULT_FILL,
  size = WHITEBOARD_STICKY_START_SIZE
}: {
  fill?: string
  size?: {
    width: number
    height: number
  }
} = {}): NodeTemplate => ({
  type: 'sticky',
  size: { ...size },
  data: {
    text: ''
  },
  style: {
    fill,
    color: WHITEBOARD_STICKY_DEFAULT_TEXT_COLOR
  }
})

export const createWhiteboardFrameTemplate = (): NodeTemplate => ({
  type: 'frame',
  size: { ...WHITEBOARD_FRAME_START_SIZE },
  data: {
    title: WHITEBOARD_FRAME_DEFAULT_TITLE
  },
  style: {
    fill: WHITEBOARD_FRAME_DEFAULT_FILL,
    stroke: WHITEBOARD_FRAME_DEFAULT_STROKE,
    strokeWidth: WHITEBOARD_FRAME_DEFAULT_STROKE_WIDTH,
    color: WHITEBOARD_FRAME_DEFAULT_TEXT_COLOR
  }
})

import type { SpatialNodeInput } from '../types'

export const TEXT_START_SIZE = {
  width: 144,
  height: 24
} as const

export const STICKY_START_SIZE = {
  width: 200,
  height: 150
} as const

export const TEXT_PLACEHOLDER = 'Text'
export const STICKY_PLACEHOLDER = 'Sticky'
export const STICKY_DEFAULT_FILL = 'hsl(var(--tag-yellow-background, 47.6 70.7% 92%))'
export const STICKY_DEFAULT_TEXT_COLOR = 'hsl(var(--ui-text-primary, 40 2.1% 28%))'
export const STICKY_DEFAULT_STROKE = 'hsl(var(--ui-text-primary, 40 2.1% 28%) / 0.12)'
export const STICKY_DEFAULT_STROKE_WIDTH = 1

export const FRAME_START_SIZE = {
  width: 520,
  height: 320
} as const

export const FRAME_DEFAULT_TITLE = 'Frame'
export const FRAME_DEFAULT_FILL = 'transparent'
export const FRAME_DEFAULT_STROKE = 'hsl(var(--ui-border-strong, 40 9.1% 93.5%))'
export const FRAME_DEFAULT_TEXT_COLOR = 'hsl(var(--ui-text-secondary, 37.5 3.3% 47.5%))'
export const FRAME_DEFAULT_STROKE_WIDTH = 1

export const createTextNodeInput = (): Omit<SpatialNodeInput, 'position'> => ({
  type: 'text',
  size: { ...TEXT_START_SIZE },
  data: { text: '' }
})

export const createStickyNodeInput = (
  fill = STICKY_DEFAULT_FILL
): Omit<SpatialNodeInput, 'position'> => ({
  type: 'sticky',
  size: { ...STICKY_START_SIZE },
  data: {
    text: '',
    background: fill
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

import {
  resolveDrawPoints,
  resolveDrawStroke
} from '@whiteboard/core/node'
import type { NodeInput, Point } from '@whiteboard/core/types'
import {
  hasDrawBrush,
  readDrawStyle,
  type DrawBrush,
  type DrawPreview,
  type DrawState,
  type DrawStyle
} from '#whiteboard-editor/local/draw'
import type { PointerDownInput, PointerSample } from '#whiteboard-editor/types/input'
import type { Tool } from '#whiteboard-editor/types/tool'

const DRAW_MIN_LENGTH_SCREEN = 4
const SAMPLE_DISTANCE_SCREEN = 1

type DrawStrokePointer = {
  samples: readonly PointerSample[]
}

export type DrawStrokeState = {
  brush: DrawBrush
  style: DrawStyle
  points: readonly Point[]
  lastScreen: Point
  lengthScreen: number
}

const hasMovedEnough = (
  left: Point,
  right: Point
) => {
  const dx = right.x - left.x
  const dy = right.y - left.y
  return (dx * dx) + (dy * dy) >= SAMPLE_DISTANCE_SCREEN * SAMPLE_DISTANCE_SCREEN
}

const appendStrokeSample = (
  state: DrawStrokeState,
  sample: PointerSample,
  force = false
): DrawStrokeState => {
  const previous = state.points[state.points.length - 1]

  if (!force && !hasMovedEnough(state.lastScreen, sample.screen)) {
    return state
  }

  if (
    previous
    && previous.x === sample.world.x
    && previous.y === sample.world.y
  ) {
    return state.lastScreen.x === sample.screen.x
      && state.lastScreen.y === sample.screen.y
      ? state
      : {
          ...state,
          lastScreen: sample.screen
        }
  }

  return {
    ...state,
    points: [...state.points, sample.world],
    lengthScreen:
      state.lengthScreen
      + Math.hypot(
          sample.screen.x - state.lastScreen.x,
          sample.screen.y - state.lastScreen.y
        ),
    lastScreen: sample.screen
  }
}

const resolveStrokePoints = (
  points: readonly Point[],
  zoom: number
) => resolveDrawPoints({
  points,
  zoom
})

export const startDrawStroke = (input: {
  tool: Tool
  pointer: PointerDownInput
  state: DrawState
}): DrawStrokeState | undefined => {
  if (
    input.tool.type !== 'draw'
    || !hasDrawBrush(input.tool.mode)
    || input.pointer.pick.kind !== 'background'
    || input.pointer.editable
    || input.pointer.ignoreInput
    || input.pointer.ignoreSelection
  ) {
    return undefined
  }

  return {
    brush: input.tool.mode,
    style: readDrawStyle(input.state, input.tool.mode),
    points: [input.pointer.world],
    lastScreen: input.pointer.screen,
    lengthScreen: 0
  }
}

export const stepDrawStroke = (
  state: DrawStrokeState,
  input: DrawStrokePointer,
  options?: {
    force?: boolean
  }
): DrawStrokeState => {
  let nextState = state

  for (let index = 0; index < input.samples.length; index += 1) {
    nextState = appendStrokeSample(
      nextState,
      input.samples[index]!,
      options?.force === true && index === input.samples.length - 1
    )
  }

  return nextState
}

export const previewDrawStroke = (
  state: DrawStrokeState,
  input: {
    zoom: number
  }
): DrawPreview => ({
  kind: state.brush,
  style: state.style,
  points: resolveStrokePoints(state.points, input.zoom)
})

export const commitDrawStroke = (
  state: DrawStrokeState,
  input: {
    zoom: number
  }
): NodeInput | undefined => {
  if (
    state.points.length < 2
    || state.lengthScreen < DRAW_MIN_LENGTH_SCREEN
  ) {
    return undefined
  }

  const stroke = resolveDrawStroke({
    points: resolveStrokePoints(state.points, input.zoom),
    width: state.style.width
  })
  if (!stroke) {
    return undefined
  }

  return {
    type: 'draw',
    position: stroke.position,
    size: stroke.size,
    data: {
      points: stroke.points,
      baseSize: stroke.size
    },
    style: {
      stroke: state.style.color,
      strokeWidth: state.style.width,
      opacity: state.style.opacity
    }
  }
}

import {
  resolveDrawPoints,
  resolveDrawStroke
} from '@whiteboard/core/node'
import type { Point } from '@whiteboard/core/types'
import type { PointerDownInput, PointerSample } from '../../types/input'
import type { InteractionContext } from '../context'
import type {
  InteractionSession
} from '../../runtime/interaction/types'
import type { DrawBrushKind } from '../../types/tool'
import type {
  ResolvedDrawStyle
} from '../../types/draw'
import { readDrawStyle } from '../../draw'

const DRAW_MIN_LENGTH_SCREEN = 4
const SAMPLE_DISTANCE_SCREEN = 1

type DrawInteractionCtx = Pick<
  InteractionContext,
  'read' | 'write'
>

type DrawPointer = {
  samples: readonly PointerSample[]
}

export type StrokeState = {
  brush: DrawBrushKind
  style: ResolvedDrawStyle
  points: readonly Point[]
  lastScreen: Point
  lengthScreen: number
}

const readZoom = (
  ctx: DrawInteractionCtx
) => ctx.read.viewport.get().zoom

const readStyle = (
  ctx: DrawInteractionCtx,
  kind: DrawBrushKind
) => readDrawStyle(
  ctx.read.draw.preferences.get(),
  kind
)

const resolveStrokePoints = (
  ctx: DrawInteractionCtx,
  points: readonly Point[]
) => resolveDrawPoints({
  points,
  zoom: readZoom(ctx)
})

const clearStrokeOverlay = (
  ctx: DrawInteractionCtx
) => {
  ctx.write.preview.draw.setPreview(null)
}

const writeStrokePreview = (
  ctx: DrawInteractionCtx,
  state: StrokeState
) => {
  ctx.write.preview.draw.setPreview({
    kind: state.brush,
    style: state.style,
    points: resolveStrokePoints(ctx, state.points)
  })
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
  state: StrokeState,
  sample: PointerSample,
  force = false
): StrokeState => {
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

export const startStrokeState = (
  ctx: DrawInteractionCtx,
  input: PointerDownInput
): StrokeState | null => {
  const tool = ctx.read.tool.get()

  if (
    tool.type !== 'draw'
    || tool.kind === 'eraser'
    || input.pick.kind !== 'background'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  return {
    brush: tool.kind,
    style: readStyle(ctx, tool.kind),
    points: [input.world],
    lastScreen: input.screen,
    lengthScreen: 0
  }
}

const stepStrokeState = (
  state: StrokeState,
  input: DrawPointer,
  force = false
) => {
  let nextState = state

  for (let index = 0; index < input.samples.length; index += 1) {
    nextState = appendStrokeSample(
      nextState,
      input.samples[index]!,
      force && index === input.samples.length - 1
    )
  }

  return nextState
}

const commitStrokeState = (
  ctx: DrawInteractionCtx,
  state: StrokeState
) => {
  if (
    state.points.length < 2
    || state.lengthScreen < DRAW_MIN_LENGTH_SCREEN
  ) {
    return
  }

  const stroke = resolveDrawStroke({
    points: resolveStrokePoints(ctx, state.points),
    width: state.style.width
  })
  if (!stroke) {
    return
  }

  ctx.write.document.node.create({
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
  })
}

export const createStrokeSession = (
  ctx: DrawInteractionCtx,
  initial: StrokeState
): InteractionSession => {
  let state = initial

  const step = (
    input: DrawPointer,
    force = false
  ) => {
    const nextState = stepStrokeState(state, input, force)
    if (nextState.points !== state.points) {
      writeStrokePreview(ctx, nextState)
    }
    state = nextState
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input, true)
      commitStrokeState(ctx, state)
      return {
        kind: 'finish'
      }
    },
    cleanup: () => {
      clearStrokeOverlay(ctx)
    }
  }
}

import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  NodeId,
  NodeInput,
  Point,
  Rect
} from '@whiteboard/core/types'
import {
  type DrawState,
  type DrawStyle
} from '@whiteboard/editor/session/draw/state'
import type {
  DrawPreview
} from '@whiteboard/editor/session/draw/state'
import {
  readDrawStyle
} from '@whiteboard/editor/session/draw/state'
import {
  type DrawBrush,
  hasDrawBrush
} from '@whiteboard/editor/session/draw/model'
import type { InteractionBinding, InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import type { PointerDownInput, PointerSample } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'

const DRAW_MIN_LENGTH_SCREEN = 4
const SAMPLE_DISTANCE_SCREEN = 1
const ERASER_HIT_EPSILON_SCREEN = 2
const ZOOM_EPSILON = 0.0001

type DrawPointer = {
  samples: readonly PointerSample[]
}

type DrawStrokeState = {
  brush: DrawBrush
  style: DrawStyle
  points: readonly Point[]
  lastScreen: Point
  lengthScreen: number
}

type EraseState = {
  ids: readonly NodeId[]
  lastWorld: Point
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
) => nodeApi.draw.resolvePoints({
  points,
  zoom
})

const tryStartDrawStroke = (input: {
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

const stepDrawStroke = (
  state: DrawStrokeState,
  input: DrawPointer,
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

const previewDrawStroke = (
  state: DrawStrokeState,
  input: {
    zoom: number
  }
): DrawPreview => ({
  kind: state.brush,
  style: state.style,
  points: resolveStrokePoints(state.points, input.zoom)
})

const commitDrawStroke = (
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

  const stroke = nodeApi.draw.resolveStroke({
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

const queryDrawNodeIdsInRect = (
  ctx: Pick<EditorHostDeps, 'projection' | 'document'>,
  rect: Rect
): readonly NodeId[] => ctx.projection.node.idsInRect(rect, {
  match: 'touch'
}).filter((nodeId) => (
  ctx.document.node.committed.get(nodeId)?.node.type === 'draw'
))

const collectErasePoint = (
  ctx: Pick<EditorHostDeps, 'projection' | 'document' | 'sessionRead'>,
  state: EraseState,
  world: Point
): EraseState => {
  const halfWorld =
    ERASER_HIT_EPSILON_SCREEN
    / Math.max(ctx.sessionRead.viewport.get().zoom, ZOOM_EPSILON)
  const nodeIds = queryDrawNodeIdsInRect(
    ctx,
    geometryApi.segment.bounds(state.lastWorld, world, halfWorld)
  )
  const knownIds = new Set(state.ids)
  const nextIds = [...state.ids]

  for (let index = 0; index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index]!
    if (knownIds.has(nodeId)) {
      continue
    }

    knownIds.add(nodeId)
    nextIds.push(nodeId)
  }

  const ids = nextIds.length === state.ids.length
    ? state.ids
    : nextIds

  return (
    ids === state.ids
    && state.lastWorld.x === world.x
    && state.lastWorld.y === world.y
  )
    ? state
    : {
        ...state,
        ids,
        lastWorld: world
      }
}

const tryStartErase = (
  ctx: Pick<EditorHostDeps, 'sessionRead' | 'projection' | 'document'>,
  input: PointerDownInput
): EraseState | null => {
  const tool = ctx.sessionRead.tool.get()

  if (
    tool.type !== 'draw'
    || tool.mode !== 'eraser'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  return collectErasePoint(ctx, {
    ids: [],
    lastWorld: input.world
  }, input.world)
}

const stepEraseState = (
  ctx: Pick<EditorHostDeps, 'sessionRead' | 'projection' | 'document'>,
  state: EraseState,
  input: DrawPointer
) => {
  let nextState = state

  for (let index = 0; index < input.samples.length; index += 1) {
    nextState = collectErasePoint(ctx, nextState, input.samples[index]!.world)
  }

  return nextState
}

const createDrawStrokeSession = (
  ctx: Pick<EditorHostDeps, 'sessionRead' | 'write'>,
  initial: DrawStrokeState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    input: DrawPointer,
    force = false
  ) => {
    const nextState = stepDrawStroke(
      state,
      input,
      {
        force
      }
    )
    state = nextState
    interaction!.gesture = createGesture('draw', {
      drawPreview: previewDrawStroke(state, {
        zoom: ctx.sessionRead.viewport.get().zoom
      })
    })
  }

  interaction = {
    mode: 'draw',
    gesture: createGesture('draw'),
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input, true)
      const commit = commitDrawStroke(state, {
        zoom: ctx.sessionRead.viewport.get().zoom
      })
      if (commit) {
        const {
          position,
          ...template
        } = commit
        ctx.write.node.create({
          position,
          template
        })
      }
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

const createEraseSession = (
  ctx: Pick<EditorHostDeps, 'sessionRead' | 'projection' | 'document' | 'write'>,
  initial: EraseState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    input: DrawPointer
  ) => {
    const nextState = stepEraseState(ctx, state, input)
    state = nextState
    interaction!.gesture = createGesture('draw', {
      hiddenNodeIds: state.ids
    })
  }

  interaction = {
    mode: 'draw',
    gesture: createGesture('draw', {
      hiddenNodeIds: state.ids
    }),
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input)
      if (state.ids.length > 0) {
        ctx.write.node.delete([...state.ids])
      }
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

export const createDrawBinding = (
  ctx: Pick<EditorHostDeps, 'sessionRead' | 'projection' | 'document' | 'write'>
): InteractionBinding => ({
  key: 'draw',
  start: (input) => {
    const tool = ctx.sessionRead.tool.get()

    if (tool.type !== 'draw') {
      return null
    }

    if (tool.mode === 'eraser') {
      const state = tryStartErase(ctx, input)
      return state
        ? createEraseSession(ctx, state)
        : null
    }

    const state = tryStartDrawStroke({
      tool,
      pointer: input,
      state: ctx.sessionRead.draw.get()
    })
    return state
      ? createDrawStrokeSession(ctx, state)
      : null
  }
})

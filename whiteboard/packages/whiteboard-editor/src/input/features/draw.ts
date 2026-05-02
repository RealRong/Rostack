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
} from '@whiteboard/editor/schema/draw-state'
import type {
  DrawPreview
} from '@whiteboard/editor/schema/draw-state'
import {
  readDrawStyle
} from '@whiteboard/editor/schema/draw-state'
import {
  type DrawBrush,
  hasDrawBrush
} from '@whiteboard/editor/schema/draw-mode'
import type { InteractionBinding, InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/internals/result'
import type { PointerDownInput, PointerSample } from '@whiteboard/editor/api/input'
import type { Tool } from '@whiteboard/editor/schema/tool'
import type { Editor } from '@whiteboard/editor/api/editor'
import type { EditorCommand } from '@whiteboard/editor/state/intents'
import {
  isPreviewEqual,
  replacePreviewNodeInteraction,
  setPreviewDraw
} from '@whiteboard/editor/state/preview'

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
  editor: Editor,
  rect: Rect
): readonly NodeId[] => editor.scene.nodes.idsInRect(rect, {
  match: 'touch'
}).filter((nodeId) => (
  editor.document.node(nodeId)?.type === 'draw'
))

const collectErasePoint = (
  editor: Editor,
  state: EraseState,
  world: Point
): EraseState => {
  const halfWorld =
    ERASER_HIT_EPSILON_SCREEN
    / Math.max(editor.scene.ui.state.viewport.get().zoom, ZOOM_EPSILON)
  const nodeIds = queryDrawNodeIdsInRect(
    editor,
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
  editor: Editor,
  input: PointerDownInput
): EraseState | null => {
  const tool = editor.scene.ui.state.tool.get()

  if (
    tool.type !== 'draw'
    || tool.mode !== 'eraser'
    || input.editable
    || input.ignoreInput
    || input.ignoreSelection
  ) {
    return null
  }

  return collectErasePoint(editor, {
    ids: [],
    lastWorld: input.world
  }, input.world)
}

const stepEraseState = (
  editor: Editor,
  state: EraseState,
  input: DrawPointer
) => {
  let nextState = state

  for (let index = 0; index < input.samples.length; index += 1) {
    nextState = collectErasePoint(editor, nextState, input.samples[index]!.world)
  }

  return nextState
}

const createDrawStrokeSession = (
  editor: Editor,
  initial: DrawStrokeState
): InteractionSession => {
  let state = initial

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
    editor.dispatch((snapshot) => {
      const current = snapshot.overlay.preview
      const drawPreview = previewDrawStroke(state, {
        zoom: editor.scene.ui.state.viewport.get().zoom
      })
      const nextPreview = setPreviewDraw(current, {
        ...drawPreview,
        hiddenNodeIds: []
      })
      return isPreviewEqual(current, nextPreview)
        ? null
        : {
            type: 'overlay.preview.set',
            preview: nextPreview
          } satisfies EditorCommand
    })
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input, true)
      const commit = commitDrawStroke(state, {
        zoom: editor.scene.ui.state.viewport.get().zoom
      })
      if (commit) {
        const {
          position,
          ...template
        } = commit
        editor.actions.node.create({
          position,
          template
        })
      }
      return FINISH
    },
    cleanup: () => {
      editor.dispatch((snapshot) => {
        const current = snapshot.overlay.preview
        const nextPreview = setPreviewDraw(current, null)
        return isPreviewEqual(current, nextPreview)
          ? null
          : {
              type: 'overlay.preview.set',
              preview: nextPreview
            } satisfies EditorCommand
      })
    }
  }
}

const createEraseSession = (
  editor: Editor,
  initial: EraseState
): InteractionSession => {
  let state = initial

  editor.dispatch((snapshot) => {
    const current = snapshot.overlay.preview
    const nextPreview = replacePreviewNodeInteraction(current, {
      hiddenNodeIds: state.ids
    })
    return isPreviewEqual(current, nextPreview)
      ? null
      : {
          type: 'overlay.preview.set',
          preview: nextPreview
        } satisfies EditorCommand
  })

  const step = (
    input: DrawPointer
  ) => {
    const nextState = stepEraseState(editor, state, input)
    state = nextState
    editor.dispatch((snapshot) => {
      const current = snapshot.overlay.preview
      const nextPreview = replacePreviewNodeInteraction(current, {
        hiddenNodeIds: state.ids
      })
      return isPreviewEqual(current, nextPreview)
        ? null
        : {
            type: 'overlay.preview.set',
            preview: nextPreview
          } satisfies EditorCommand
    })
  }

  return {
    mode: 'draw',
    move: (input) => {
      step(input)
    },
    up: (input) => {
      step(input)
      if (state.ids.length > 0) {
        editor.actions.node.delete([...state.ids])
      }
      return FINISH
    },
    cleanup: () => {
      editor.dispatch((snapshot) => {
        const current = snapshot.overlay.preview
        const nextPreview = replacePreviewNodeInteraction(current, {})
        return isPreviewEqual(current, nextPreview)
          ? null
          : {
              type: 'overlay.preview.set',
              preview: nextPreview
            } satisfies EditorCommand
      })
    }
  }
}

export const createDrawBinding = (
  editor: Editor
): InteractionBinding => ({
  key: 'draw',
  start: (input) => {
    const tool = editor.scene.ui.state.tool.get()

    if (tool.type !== 'draw') {
      return null
    }

    if (tool.mode === 'eraser') {
      const state = tryStartErase(editor, input)
      return state
        ? createEraseSession(editor, state)
        : null
    }

    const state = tryStartDrawStroke({
      tool,
      pointer: input,
      state: editor.scene.ui.state.draw.get()
    })
    return state
      ? createDrawStrokeSession(editor, state)
      : null
  }
})

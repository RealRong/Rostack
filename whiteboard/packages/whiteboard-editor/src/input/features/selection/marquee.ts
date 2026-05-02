import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Point,
  Rect
} from '@whiteboard/core/types'
import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import {
  FINISH
} from '@whiteboard/editor/input/internals/result'
import type {
  InteractionSession
} from '@whiteboard/editor/input/core/types'
import type { PointerDownInput } from '@whiteboard/editor/api/input'
import { GestureTuning } from '@whiteboard/editor/input/internals/tuning'
import type { Editor } from '@whiteboard/editor/api/editor'

export type MarqueeMatch = 'touch' | 'contain'

type SelectionMarqueeAction = {
  kind: 'marquee'
  match: MarqueeMatch
  mode: SelectionMode
  base: SelectionTarget
  clearOnStart?: boolean
}

type MarqueeSelectionBaseState = {
  pointerId: number
  startScreen: Point
  startWorld: Point
  match: MarqueeMatch
  mode: SelectionMode
  base: SelectionTarget
  selection: SelectionTarget
}

type MarqueeSelectionState =
  | (MarqueeSelectionBaseState & {
      kind: 'armed'
    })
  | (MarqueeSelectionBaseState & {
      kind: 'active'
      worldRect: Rect
    })
  | (MarqueeSelectionBaseState & {
      kind: 'finished'
      worldRect?: Rect
    })

type MarqueeSelectionEvent =
  | {
      type: 'pointer.move' | 'pointer.up'
      currentScreen: Point
      currentWorld: Point
      minDistance: number
      matched: SelectionTarget
    }
  | {
      type: 'cancel'
}

const readMatchedSelection = (
  input: {
    editor: Editor
    rect: Rect
    match: SelectionMarqueeAction['match']
  }
): SelectionTarget => ({
  nodeIds: input.editor.scene.nodes.idsInRect(input.rect, {
    match: input.match,
    policy: 'selection-marquee'
  }),
  edgeIds: input.editor.scene.edges.idsInRect(input.rect, {
    match: input.match
  })
})

const hasMarqueeStarted = (input: {
  startScreen: Point
  currentScreen: Point
  minDistance: number
  active: boolean
}) => {
  if (input.active) {
    return true
  }

  const dx = Math.abs(input.currentScreen.x - input.startScreen.x)
  const dy = Math.abs(input.currentScreen.y - input.startScreen.y)

  return dx >= input.minDistance || dy >= input.minDistance
}

const toMarqueeSelectionState = (
  input: {
    previous: MarqueeSelectionState
    event: Extract<MarqueeSelectionEvent, {
      type: 'pointer.move' | 'pointer.up'
    }>
  }
): MarqueeSelectionState => {
  const active = hasMarqueeStarted({
    startScreen: input.previous.startScreen,
    currentScreen: input.event.currentScreen,
    minDistance: input.event.minDistance,
    active: input.previous.kind === 'active'
  })

  if (!active) {
    return input.event.type === 'pointer.up'
      ? {
          ...input.previous,
          kind: 'finished'
        }
      : input.previous
  }

  const worldRect = geometryApi.rect.fromPoints(
    input.previous.startWorld,
    input.event.currentWorld
  )
  const selection = selectionApi.target.apply(
    input.previous.base,
    input.event.matched,
    input.previous.mode
  )

  return {
    ...input.previous,
    kind: input.event.type === 'pointer.up' ? 'finished' : 'active',
    worldRect,
    selection
  }
}

const startMarqueeSelection = (
  input: {
    pointerId: number
    startScreen: Point
    startWorld: Point
    match: MarqueeMatch
    mode: SelectionMode
    base: SelectionTarget
  }
): MarqueeSelectionState => ({
  kind: 'armed',
  pointerId: input.pointerId,
  startScreen: input.startScreen,
  startWorld: input.startWorld,
  match: input.match,
  mode: input.mode,
  base: input.base,
  selection: input.base
})

const reduceMarqueeSelection = (
  state: MarqueeSelectionState,
  event: MarqueeSelectionEvent
): MarqueeSelectionState => {
  if (state.kind === 'finished') {
    return state
  }

  if (event.type === 'cancel') {
    return {
      ...state,
      kind: 'finished'
    }
  }

  return toMarqueeSelectionState({
    previous: state,
    event
  })
}

const syncMarqueeInteraction = (
  editor: Editor,
  previous: MarqueeSelectionState,
  next: MarqueeSelectionState
) => {
  if (!selectionApi.target.equal(previous.selection, next.selection)) {
    editor.dispatch({
      type: 'selection.set',
      selection: next.selection
    })
  }

  editor.state.write(({
    writer
  }) => {
    writer.preview.selection.patch(
      next.kind === 'active'
        ? {
            marquee: {
              worldRect: next.worldRect,
              match: next.match
            },
            guides: []
          }
        : previous.kind === 'active'
          ? {
              marquee: undefined,
              guides: []
            }
          : {
              guides: []
            }
    )
  })
}

export const createMarqueeSession = (
  editor: Editor,
  input: {
    start: PointerDownInput
    action: SelectionMarqueeAction
  }
): InteractionSession => {
  let state = startMarqueeSelection({
    pointerId: input.start.pointerId,
    startScreen: input.start.screen,
    startWorld: input.start.world,
    match: input.action.match,
    mode: input.action.mode,
    base: input.action.base
  })

  if (input.action.clearOnStart) {
    editor.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: [],
        edgeIds: []
      }
    })
  }

  const dispatch = (
    event: MarqueeSelectionEvent
  ) => {
    const previous = state
    state = reduceMarqueeSelection(state, event)
    syncMarqueeInteraction(editor, previous, state)
  }

  const step = (
    pointer: Pick<PointerDownInput, 'screen' | 'world'>
  ) => {
    dispatch({
      type: 'pointer.move',
      currentScreen: pointer.screen,
      currentWorld: pointer.world,
      minDistance: GestureTuning.dragMinDistance,
      matched: readMatchedSelection({
        editor,
        rect: geometryApi.rect.fromPoints(state.startWorld, pointer.world),
        match: input.action.match
      })
    })
  }

  return {
    mode: 'marquee',
    pointerId: input.start.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        if (state.kind !== 'active') {
          return
        }

        const sample = editor.viewport.pointer(pointer)
        step({
          screen: sample.screen,
          world: sample.world
        })
      }
    },
    move: (next) => {
      step(next)
    },
    up: (next) => {
      dispatch({
        type: 'pointer.up',
        currentScreen: next.screen,
        currentWorld: next.world,
        minDistance: GestureTuning.dragMinDistance,
        matched: readMatchedSelection({
          editor,
          rect: geometryApi.rect.fromPoints(state.startWorld, next.world),
          match: input.action.match
        })
      })
      return FINISH
    },
    cleanup: () => {
      dispatch({
        type: 'cancel'
      })
    }
  }
}

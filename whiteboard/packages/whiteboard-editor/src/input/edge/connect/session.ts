import {
  toEdgeConnectPatch
} from '@whiteboard/core/edge'
import {
  quantizePointToOctilinear
} from '@whiteboard/core/geometry'
import type {
  EdgeConnectState
} from '@whiteboard/core/edge'
import type {
  EdgePatch,
  Point
} from '@whiteboard/core/types'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/core/result'
import { createEdgeGesture } from '@whiteboard/editor/input/core/gesture'
import {
  commitEdgeConnect,
  stepEdgeConnect
} from '@whiteboard/editor/input/edge/connect/start'
import type {
  KeyboardInput,
  ModifierKeys,
  PointerDownInput
} from '@whiteboard/editor/types/input'
import type { InteractionContext } from '@whiteboard/editor/input/context'

const EMPTY_MODIFIERS: ModifierKeys = {
  alt: false,
  shift: false,
  ctrl: false,
  meta: false
}

const STRAIGHT_RECONNECT_PATCH: EdgePatch = {
  type: 'straight',
  route: {
    kind: 'auto'
  }
}

const mergeEdgePatch = (
  base?: EdgePatch,
  patch?: EdgePatch
): EdgePatch | undefined => {
  if (!base) {
    return patch
  }
  if (!patch) {
    return base
  }

  return {
    ...base,
    ...patch
  }
}

const readReconnectPatch = (
  state: EdgeConnectState,
  draftPatch?: EdgePatch
): EdgePatch | undefined => state.kind === 'reconnect'
  ? mergeEdgePatch(
      toEdgeConnectPatch(state),
      draftPatch
    )
  : undefined

const readReconnectFixedPoint = (
  ctx: InteractionContext,
  state: EdgeConnectState
): Point | undefined => {
  if (state.kind !== 'reconnect') {
    return undefined
  }

  const resolved = ctx.query.edge.resolved.get(state.edgeId)
  if (!resolved) {
    return undefined
  }

  return state.end === 'source'
    ? resolved.ends.target.point
    : resolved.ends.source.point
}

const readReconnectDraftPatch = ({
  state,
  current,
  modifiers,
  allowLatch
}: {
  state: EdgeConnectState
  current?: EdgePatch
  modifiers: ModifierKeys
  allowLatch: boolean
}): EdgePatch | undefined => (
  state.kind === 'reconnect'
  && allowLatch
  && modifiers.shift
)
  ? mergeEdgePatch(current, STRAIGHT_RECONNECT_PATCH)
  : current

const readReconnectWorld = ({
  state,
  world,
  fixedPoint,
  modifiers,
  draftPatch
}: {
  state: EdgeConnectState
  world: Point
  fixedPoint?: Point
  modifiers: ModifierKeys
  draftPatch?: EdgePatch
}): Point => (
  state.kind === 'reconnect'
  && modifiers.shift
  && draftPatch?.type === 'straight'
  && draftPatch.route?.kind === 'auto'
  && fixedPoint
)
  ? quantizePointToOctilinear({
      point: world,
      origin: fixedPoint
    })
  : world

const commitConnectState = (
  ctx: InteractionContext,
  state: EdgeConnectState,
  reconnectDraftPatch?: EdgePatch
) => {
  const commit = commitEdgeConnect(state)
  if (!commit) {
    return
  }

  if (commit.kind === 'reconnect') {
    const patch = readReconnectPatch(state, reconnectDraftPatch)
    if (!patch) {
      return
    }

    ctx.command.edge.patch([commit.edgeId], patch)
    return
  }

  const result = ctx.command.edge.create(commit.input)
  if (!result.ok) {
    return
  }

  ctx.local.session.tool.set({
    type: 'select'
  })
  ctx.local.session.selection.replace({
    edgeIds: [result.data.edgeId]
  })
}

export const createEdgeConnectSession = (
  ctx: InteractionContext,
  initial: EdgeConnectState
): InteractionSession => {
  let state = initial
  let lastWorld = initial.to?.point ?? initial.from.point
  let lastModifiers = EMPTY_MODIFIERS
  let reconnectDraftPatch = undefined as EdgePatch | undefined
  const reconnectFixedPoint = readReconnectFixedPoint(ctx, initial)
  const originWorld = lastWorld

  const shouldShowPreviewPath = (
    world: PointerDownInput['world']
  ) => Math.hypot(
    world.x - originWorld.x,
    world.y - originWorld.y
  ) > 3 / Math.max(ctx.query.viewport.get().zoom, 0.0001)

  const project = ({
    world,
    modifiers,
    allowLatch,
    pointerId
  }: {
    world: PointerDownInput['world']
    modifiers: ModifierKeys
    allowLatch: boolean
    pointerId?: number
  }) => {
    if (pointerId !== undefined && pointerId !== state.pointerId) {
      return undefined
    }

    lastWorld = world
    lastModifiers = modifiers
    reconnectDraftPatch = readReconnectDraftPatch({
      state,
      current: reconnectDraftPatch,
      modifiers,
      allowLatch
    })
    const result = stepEdgeConnect({
      node: ctx.query.node,
      state,
      world: readReconnectWorld({
        state,
        world,
        fixedPoint: reconnectFixedPoint,
        modifiers,
        draftPatch: reconnectDraftPatch
      }),
      snap: ctx.snap.edge.connect,
      showPreviewPath: shouldShowPreviewPath(world)
    })
    state = result.state

    return createEdgeGesture(
      'edge-connect',
      state.kind === 'reconnect'
        ? {
            ...result.gesture,
            patches: (() => {
              const patch = readReconnectPatch(state, reconnectDraftPatch)
              return patch
                ? [{
                    id: state.edgeId,
                    patch
                  }]
                : []
            })()
          }
        : result.gesture
    )
  }

  const initialGesture = project({
    world: lastWorld,
    modifiers: lastModifiers,
    allowLatch: false
  }) ?? null

  const interaction: InteractionSession = {
    mode: 'edge-connect',
    pointerId: state.pointerId,
    chrome: false,
    gesture: initialGesture,
    autoPan: {
      frame: (pointer) => {
        interaction.gesture = project({
          world: ctx.query.viewport.pointer(pointer).world,
          modifiers: lastModifiers,
          allowLatch: true,
          pointerId: state.pointerId
        }) ?? interaction.gesture
      }
    },
    move: (input) => {
      interaction.gesture = project({
        world: input.world,
        modifiers: input.modifiers,
        allowLatch: true,
        pointerId: input.pointerId
      }) ?? interaction.gesture
    },
    keydown: (input: KeyboardInput) => {
      interaction.gesture = project({
        world: lastWorld,
        modifiers: input.modifiers,
        allowLatch: false
      }) ?? interaction.gesture
    },
    keyup: (input: KeyboardInput) => {
      interaction.gesture = project({
        world: lastWorld,
        modifiers: input.modifiers,
        allowLatch: false
      }) ?? interaction.gesture
    },
    up: () => {
      commitConnectState(ctx, state, reconnectDraftPatch)
      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

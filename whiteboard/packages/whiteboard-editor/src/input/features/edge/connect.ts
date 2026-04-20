import {
  DEFAULT_EDGE_ANCHOR_OFFSET,
  type EdgeConnectEvaluation,
  type EdgeConnectPreview,
  resolveAnchorFromPoint,
  resolveEdgeConnectPreview,
  resolveEdgeView,
  resolveReconnectDraftEnd,
  setEdgeConnectTarget,
  startEdgeCreate,
  startEdgeReconnect,
  toEdgeConnectCommit,
  toEdgeDraftEnd,
  toEdgeConnectPatch,
  type EdgeConnectState
} from '@whiteboard/core/edge'
import type { BoardConfig } from '@whiteboard/core/config'
import { getNodeAnchor, readNodeRotation } from '@whiteboard/core/node'
import {
  quantizePointToOctilinear
} from '@whiteboard/core/geometry'
import type {
  Edge,
  EdgeTemplate,
  EdgeAnchor,
  EdgeEnd,
  EdgeId,
  NodeId,
  EdgePatch,
  Point
} from '@whiteboard/core/types'
import type { PointerDownInput, KeyboardInput, ModifierKeys } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import type { EdgePresentationRead } from '@whiteboard/editor/query/edge/read'
import type { NodeCanvasSnapshot, NodePresentationRead } from '@whiteboard/editor/query/node/read'

type EdgeConnectNodeRead = Pick<NodePresentationRead, 'canvas' | 'capability'>
type EdgeConnectPreviewNodeRead = Pick<NodePresentationRead, 'canvas'>
type EdgeConnectEdgeRead = Pick<EdgePresentationRead, 'item' | 'geometry' | 'capability'>
type EdgeConnectSnap = (input: {
  pointerWorld: PointerDownInput['world']
}) => EdgeConnectEvaluation

type EdgeConnectStartInput = {
  tool: Tool
  pointer: PointerDownInput
  node: EdgeConnectNodeRead
  edge: EdgeConnectEdgeRead
  zoom: number
  config: BoardConfig['edge']
}

type EdgeConnectStepInput = {
  node: EdgeConnectPreviewNodeRead
  state: EdgeConnectState
  world: PointerDownInput['world']
  snap: EdgeConnectSnap
  showPreviewPath: boolean
}

type EdgeConnectGestureInput = {
  node: EdgeConnectPreviewNodeRead
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
  showPreviewPath: boolean
}

type ConnectNodeEntry = NonNullable<
  ReturnType<EdgeConnectNodeRead['canvas']['get']>
>

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

const readConnectNode = (
  node: EdgeConnectNodeRead,
  nodeId: NodeId
): ConnectNodeEntry | undefined => {
  const entry = node.canvas.get(nodeId)
  if (!entry || entry.node.locked || !node.capability(entry.node).connect) {
    return undefined
  }

  return entry
}

const isNodeHandleConnectPick = (
  pointer: PointerDownInput
) => (
  pointer.pick.kind === 'node'
  && pointer.pick.part === 'connect'
  && Boolean(pointer.pick.side)
)

const shouldBlockFreeCreateStart = (
  pointer: PointerDownInput
) => (
  pointer.editable
  || pointer.ignoreInput
  || pointer.ignoreSelection
)

const startFreeEdgeCreate = (
  pointer: PointerDownInput,
  template: EdgeTemplate
): EdgeConnectState => startEdgeCreate({
  pointerId: pointer.pointerId,
  edgeType: template.type,
  style: template.style,
  from: toEdgeDraftEnd(pointer.world),
  to: toEdgeDraftEnd(pointer.world)
})

const startNodeEdgeCreate = (input: {
  pointer: PointerDownInput
  template: EdgeTemplate
  nodeId: NodeId
  anchor: EdgeAnchor
  point: PointerDownInput['world']
}): EdgeConnectState => startEdgeCreate({
  pointerId: input.pointer.pointerId,
  edgeType: input.template.type,
  style: input.template.style,
  from: {
    kind: 'node',
    nodeId: input.nodeId,
    anchor: input.anchor,
    point: input.point
  },
  to: toEdgeDraftEnd(input.pointer.world)
})

const resolveNodeHandleStart = (input: {
  node: EdgeConnectNodeRead
  pointer: PointerDownInput
  template: EdgeTemplate
}): EdgeConnectState | undefined => {
  const pick = input.pointer.pick
  if (
    pick.kind !== 'node'
    || pick.part !== 'connect'
    || !pick.side
  ) {
    return undefined
  }

  const entry = readConnectNode(input.node, pick.id)
  if (!entry) {
    return undefined
  }

  const anchor: EdgeAnchor = {
    side: pick.side,
    offset: DEFAULT_EDGE_ANCHOR_OFFSET
  }

  return startNodeEdgeCreate({
    pointer: input.pointer,
    template: input.template,
    nodeId: pick.id,
    anchor,
    point: getNodeAnchor(
      entry.node,
      entry.geometry.rect,
      anchor,
      readNodeRotation(entry.node)
    )
  })
}

const resolveNodeBodyStart = (input: {
  node: EdgeConnectNodeRead
  pointer: PointerDownInput
  template: EdgeTemplate
  zoom: number
  config: BoardConfig['edge']
}): EdgeConnectState | undefined => {
  const pick = input.pointer.pick
  if (
    pick.kind !== 'node'
    || pick.part !== 'body'
  ) {
    return undefined
  }

  const entry = readConnectNode(input.node, pick.id)
  if (!entry) {
    return undefined
  }

  const resolved = resolveAnchorFromPoint({
    node: entry.node,
    rect: entry.geometry.rect,
    rotation: readNodeRotation(entry.node),
    pointWorld: input.pointer.world,
    zoom: input.zoom,
    config: input.config
  })

  return startNodeEdgeCreate({
    pointer: input.pointer,
    template: input.template,
    nodeId: pick.id,
    anchor: resolved.anchor,
    point: resolved.point
  })
}

const resolveCreateStart = (input: {
  node: EdgeConnectNodeRead
  pointer: PointerDownInput
  template: EdgeTemplate
  zoom: number
  config: BoardConfig['edge']
}): EdgeConnectState | undefined => (
  resolveNodeHandleStart(input)
  ?? resolveNodeBodyStart(input)
)

const resolveReconnectStart = (input: {
  edge: EdgeConnectEdgeRead
  edgeId: EdgeId
  end: 'source' | 'target'
  pointerId: number
}): EdgeConnectState | undefined => {
  const item = input.edge.item.get(input.edgeId)
  const resolved = input.edge.geometry.get(input.edgeId)
  if (!item || !resolved) {
    return undefined
  }

  const capability = input.edge.capability(item.edge)
  if (
    (input.end === 'source' && !capability.reconnectSource)
    || (input.end === 'target' && !capability.reconnectTarget)
  ) {
    return undefined
  }

  return startEdgeReconnect({
    pointerId: input.pointerId,
    edgeId: input.edgeId,
    end: input.end,
    from: resolveReconnectDraftEnd({
      end: item.edge[input.end],
      point: resolved.ends[input.end].point,
      anchor: resolved.ends[input.end].anchor,
      anchorOffset: DEFAULT_EDGE_ANCHOR_OFFSET
    })
  })
}

export const tryStartEdgeConnect = (
  input: EdgeConnectStartInput
): EdgeConnectState | undefined => {
  if (input.tool.type === 'edge') {
    if (
      !isNodeHandleConnectPick(input.pointer)
      && shouldBlockFreeCreateStart(input.pointer)
    ) {
      return undefined
    }

    return resolveCreateStart({
      node: input.node,
      pointer: input.pointer,
      template: input.tool.template,
      zoom: input.zoom,
      config: input.config
    }) ?? startFreeEdgeCreate(input.pointer, input.tool.template)
  }

  if (
    input.tool.type !== 'select'
    || input.pointer.pick.kind !== 'edge'
    || input.pointer.pick.part !== 'end'
    || !input.pointer.pick.end
  ) {
    return undefined
  }

  return resolveReconnectStart({
    edge: input.edge,
    edgeId: input.pointer.pick.id,
    end: input.pointer.pick.end,
    pointerId: input.pointer.pointerId
  })
}

const toPreviewEdgeEnd = (
  draft: EdgeConnectState['from']
): EdgeEnd => (
  draft.kind === 'node'
    ? {
        kind: 'node',
        nodeId: draft.nodeId,
        anchor: draft.anchor
      }
    : {
        kind: 'point',
        point: draft.point
      }
)

const createPreviewEdge = (
  state: EdgeConnectState
): Edge | undefined => {
  if (state.kind !== 'create' || !state.to) {
    return undefined
  }

  return {
    id: '__preview__',
    source: toPreviewEdgeEnd(state.from),
    target: toPreviewEdgeEnd(state.to),
    type: state.edgeType,
    style: state.style,
    textMode: state.textMode,
    route: { kind: 'auto' }
  }
}

const readPreviewNodeSnapshot = (
  node: EdgeConnectPreviewNodeRead,
  nodeId: NodeId
): NodeCanvasSnapshot | undefined => node.canvas.get(nodeId)

const resolveCreatePreviewPath = (
  node: EdgeConnectPreviewNodeRead,
  state: EdgeConnectState
): EdgeConnectPreview['path'] | undefined => {
  const edge = createPreviewEdge(state)
  const targetDraft = state.kind === 'create'
    ? state.to
    : undefined

  if (!edge || state.kind !== 'create' || !targetDraft) {
    return undefined
  }

  const source = state.from.kind === 'node'
    ? readPreviewNodeSnapshot(node, state.from.nodeId)
    : undefined
  const target = targetDraft.kind === 'node'
    ? readPreviewNodeSnapshot(node, targetDraft.nodeId)
    : undefined

  if (
    (state.from.kind === 'node' && !source)
    || (targetDraft.kind === 'node' && !target)
  ) {
    return undefined
  }

  const view = resolveEdgeView({
    edge,
    source,
    target
  })

  return {
    svgPath: view.path.svgPath,
    style: edge.style
  }
}

const hasConnectGuide = (
  evaluation: EdgeConnectEvaluation
) => (
  evaluation.focusedNodeId !== undefined
  || evaluation.resolution.mode !== 'free'
)

const readReconnectPreviewPatches = (
  state: EdgeConnectState,
  preview: EdgeConnectPreview | undefined
): readonly {
  id: EdgeId
  patch: EdgePatch
}[] => (
  state.kind === 'reconnect' && preview?.patch
    ? [{
        id: state.edgeId,
        patch: preview.patch
      }]
    : []
)

const readEdgeConnectGesture = (
  input: EdgeConnectGestureInput
): Parameters<typeof createGesture>[1] => {
  const preview = resolveEdgeConnectPreview(
    input.state,
    input.showPreviewPath
      ? resolveCreatePreviewPath(input.node, input.state)
      : undefined
  )

  return {
    edgePatches: readReconnectPreviewPatches(input.state, preview),
    edgeGuide: preview || hasConnectGuide(input.evaluation)
      ? {
          path: preview?.path,
          connect: {
            focusedNodeId: input.evaluation.focusedNodeId,
            resolution: input.evaluation.resolution
          }
        }
      : undefined
  }
}

const toDraftEndFromEvaluation = (
  evaluation: EdgeConnectEvaluation
) => toEdgeDraftEnd(
  evaluation.resolution.pointWorld,
  evaluation.resolution.mode === 'free'
    ? undefined
    : {
        nodeId: evaluation.resolution.nodeId,
        anchor: evaluation.resolution.anchor,
        pointWorld: evaluation.resolution.pointWorld
      }
)

const applyEdgeConnectEvaluation = (input: {
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
}): EdgeConnectState => setEdgeConnectTarget(
  input.state,
  toDraftEndFromEvaluation(input.evaluation)
)

const stepEdgeConnect = (
  input: EdgeConnectStepInput
): {
  state: EdgeConnectState
  gesture: Parameters<typeof createGesture>[1]
} => {
  const evaluation = input.snap({
    pointerWorld: input.world
  })
  const state = applyEdgeConnectEvaluation({
    state: input.state,
    evaluation
  })

  return {
    state,
    gesture: readEdgeConnectGesture({
      node: input.node,
      state,
      evaluation,
      showPreviewPath: input.showPreviewPath
    })
  }
}

const commitEdgeConnect = (
  state: EdgeConnectState
) => toEdgeConnectCommit(state)

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
  ctx: Pick<EditorHostDeps, 'query'>,
  state: EdgeConnectState
): Point | undefined => {
  if (state.kind !== 'reconnect') {
    return undefined
  }

  const resolved = ctx.query.edge.geometry.get(state.edgeId)
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
  ctx: Pick<EditorHostDeps, 'write' | 'actions'>,
  state: EdgeConnectState,
  reconnectDraftPatch?: EdgePatch
) => {
  const commit = commitEdgeConnect(state)
  if (!commit) {
    return
  }

  if (commit.kind === 'reconnect') {
    const patch = readReconnectPatch(state, reconnectDraftPatch)
    ctx.write.edge.reconnectCommit({
      edgeId: commit.edgeId,
      end: commit.end,
      target: commit.target,
      patch: patch?.type || patch?.route
        ? {
            ...(patch?.type
              ? {
                  type: patch.type
                }
              : {}),
            ...(patch?.route
              ? {
                  route: patch.route
                }
              : {})
          }
        : undefined
    })
    return
  }

  const result = ctx.write.edge.create({
    from: commit.input.source,
    to: commit.input.target,
    template: {
      type: commit.input.type,
      style: commit.input.style,
      textMode: commit.input.textMode
    }
  })
  if (!result.ok) {
    return
  }

  ctx.actions.tool.set({
    type: 'select'
  })
  ctx.actions.selection.replace({
    edgeIds: [result.data.edgeId]
  })
}

export const createEdgeConnectSession = (
  ctx: Pick<EditorHostDeps, 'query' | 'snap' | 'write' | 'actions'>,
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

    return createGesture(
      'edge-connect',
      state.kind === 'reconnect'
        ? {
            ...result.gesture,
            edgePatches: (() => {
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

import {
  edge as edgeApi,
  type EdgeConnectEvaluation,
  type EdgeConnectPreview,
  type EdgeConnectState
} from '@whiteboard/core/edge'
import type { BoardConfig } from '@whiteboard/engine/config'
import { node as nodeApi, toSpatialNode } from '@whiteboard/core/node'
import type {
  EdgeTemplate,
  EdgeAnchor,
  EdgeId,
  NodeId,
  EdgePatch
} from '@whiteboard/core/types'
import type { PointerDownInput, KeyboardInput, ModifierKeys } from '@whiteboard/editor/types/input'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/session/result'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import { resolveNodeEditorCapability } from '@whiteboard/editor/types/node'

type EdgeConnectNodeRead = Pick<EditorHostDeps, 'projection' | 'nodeType'>
type EdgeConnectPreviewGeometryRead = Pick<EditorHostDeps['projection'], 'nodes'>
type EdgeConnectEdgeRead = Pick<EditorHostDeps, 'projection'>
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
  geometry: EdgeConnectPreviewGeometryRead
  state: EdgeConnectState
  world: PointerDownInput['world']
  snap: EdgeConnectSnap
  showPreviewPath: boolean
}

type EdgeConnectGestureInput = {
  geometry: EdgeConnectPreviewGeometryRead
  state: EdgeConnectState
  evaluation: EdgeConnectEvaluation
  showPreviewPath: boolean
}

type ConnectNodeEntry = NonNullable<
  ReturnType<EdgeConnectPreviewGeometryRead['nodes']['get']>
>

const EMPTY_MODIFIERS: ModifierKeys = {
  alt: false,
  shift: false,
  ctrl: false,
  meta: false
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
): EdgeConnectState => edgeApi.connect.startCreate({
  pointerId: pointer.pointerId,
  edgeType: template.type,
  style: template.style,
  from: edgeApi.connect.toDraftEnd(pointer.world),
  to: edgeApi.connect.toDraftEnd(pointer.world)
})

const startNodeEdgeCreate = (input: {
  pointer: PointerDownInput
  template: EdgeTemplate
  nodeId: NodeId
  anchor: EdgeAnchor
  point: PointerDownInput['world']
}): EdgeConnectState => edgeApi.connect.startCreate({
  pointerId: input.pointer.pointerId,
  edgeType: input.template.type,
  style: input.template.style,
  from: {
    kind: 'node',
    nodeId: input.nodeId,
    anchor: input.anchor,
    point: input.point
  },
  to: edgeApi.connect.toDraftEnd(input.pointer.world)
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

  const entry = input.node.projection.nodes.get(
    pick.id
  ) as ConnectNodeEntry | undefined
  if (!entry) {
    return undefined
  }
  if (
    entry.base.node.locked
    || !resolveNodeEditorCapability(entry.base.node, input.node.nodeType).connect
  ) {
    return undefined
  }

  const anchor: EdgeAnchor = {
    side: pick.side,
    offset: edgeApi.connect.defaultAnchorOffset
  }

  return startNodeEdgeCreate({
    pointer: input.pointer,
    template: input.template,
    nodeId: pick.id,
    anchor,
    point: nodeApi.outline.anchor(
      toSpatialNode({
        node: entry.base.node,
        rect: entry.geometry.rect,
        rotation: entry.geometry.rotation
      }),
      entry.geometry.rect,
      anchor,
      entry.geometry.rotation
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

  const entry = input.node.projection.nodes.get(
    pick.id
  ) as ConnectNodeEntry | undefined
  if (!entry) {
    return undefined
  }
  if (
    entry.base.node.locked
    || !resolveNodeEditorCapability(entry.base.node, input.node.nodeType).connect
  ) {
    return undefined
  }

  const resolved = edgeApi.anchor.resolveFromPoint({
    node: toSpatialNode({
      node: entry.base.node,
      rect: entry.geometry.rect,
      rotation: entry.geometry.rotation
    }),
    rect: entry.geometry.rect,
    rotation: entry.geometry.rotation,
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
  const edge = input.edge.projection.edges.get(input.edgeId)?.base.edge
  const resolved = input.edge.projection.edges.get(input.edgeId)
  const resolvedEnd = resolved?.route.ends?.[input.end]
  if (!edge || !resolvedEnd) {
    return undefined
  }

  const capability = input.edge.projection.edges.capability(
    input.edgeId
  )
  if (
    !capability
    || (
    (input.end === 'source' && !capability.reconnectSource)
    || (input.end === 'target' && !capability.reconnectTarget)
    )
  ) {
    return undefined
  }

  return edgeApi.connect.startReconnect({
    pointerId: input.pointerId,
    edgeId: input.edgeId,
    end: input.end,
    from: edgeApi.connect.resolveReconnectDraftEnd({
      end: edge[input.end],
      point: resolvedEnd.point,
      anchor: resolvedEnd.anchor,
      anchorOffset: edgeApi.connect.defaultAnchorOffset
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
  const preview = edgeApi.connect.preview(
    input.state,
    input.showPreviewPath
      ? edgeApi.connect.previewPath({
          state: input.state,
          readNodeGeometry: (nodeId) => {
            const current = input.geometry.nodes.get(nodeId)
            return current
              ? {
                  node: current.base.node,
                  rect: current.geometry.rect,
                  bounds: current.geometry.bounds,
                  outline: current.geometry.outline.outline,
                  rotation: current.geometry.rotation
                }
              : undefined
          }
        })
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

const stepEdgeConnect = (
  input: EdgeConnectStepInput
): {
  state: EdgeConnectState
  gesture: Parameters<typeof createGesture>[1]
} => {
  const evaluation = input.snap({
    pointerWorld: input.world
  })
  const state = edgeApi.connect.project({
    state: input.state,
    evaluation
  })

  return {
    state,
    gesture: readEdgeConnectGesture({
      geometry: input.geometry,
      state,
      evaluation,
      showPreviewPath: input.showPreviewPath
    })
  }
}

const commitEdgeConnect = (
  state: EdgeConnectState
) => edgeApi.connect.toCommit(state)

const commitConnectState = (
  ctx: Pick<EditorHostDeps, 'write' | 'tool' | 'session'>,
  state: EdgeConnectState,
  reconnectDraftPatch?: EdgePatch
) => {
  const commit = commitEdgeConnect(state)
  if (!commit) {
    return
  }

  if (commit.kind === 'reconnect') {
    const patch = edgeApi.connect.reconnectPatch({
      state,
      draftPatch: reconnectDraftPatch
    })
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

  ctx.tool.select()
  ctx.session.dispatch({
    type: 'selection.set',
    selection: {
      nodeIds: [],
      edgeIds: [result.data.edgeId]
    }
  })
}

export const createEdgeConnectSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'snap' | 'write' | 'tool' | 'session'>,
  initial: EdgeConnectState
): InteractionSession => {
  let state = initial
  let lastWorld = initial.to?.point ?? initial.from.point
  let lastModifiers = EMPTY_MODIFIERS
  let reconnectDraftPatch = undefined as EdgePatch | undefined
  const reconnectFixedPoint = edgeApi.connect.reconnectFixedPoint({
    state: initial,
    ends: initial.kind === 'reconnect'
      ? ctx.projection.edges.get(initial.edgeId)?.route.ends
      : undefined
  })
  const originWorld = lastWorld

  const shouldShowPreviewPath = (
    world: PointerDownInput['world']
  ) => Math.hypot(
    world.x - originWorld.x,
    world.y - originWorld.y
  ) > 3 / Math.max(ctx.sessionRead.viewport.get().zoom, 0.0001)

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
    reconnectDraftPatch = edgeApi.connect.reconnectDraftPatch({
      state,
      current: reconnectDraftPatch,
      shift: modifiers.shift,
      allowLatch
    })
    const result = stepEdgeConnect({
      geometry: ctx.projection,
      state,
      world: edgeApi.connect.reconnectWorld({
        state,
        world,
        fixedPoint: reconnectFixedPoint,
        shift: modifiers.shift,
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
              const patch = edgeApi.connect.reconnectPatch({
                state,
                draftPatch: reconnectDraftPatch
              })
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
          world: ctx.sessionRead.viewport.pointer(pointer).world,
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

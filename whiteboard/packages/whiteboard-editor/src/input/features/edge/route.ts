import {
  edge as edgeApi,
  type EdgeRouteHandleTarget
} from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type {
  Edge,
  EdgeId,
  EdgePatch,
  EdgeRoutePointAnchor,
  Point
} from '@whiteboard/core/types'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import {
  CANCEL,
  FINISH
} from '@whiteboard/editor/input/session/result'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { createPressDragSession } from '@whiteboard/editor/input/session/press'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'

export type EdgeRouteHandleState =
  | {
      kind: 'anchor'
      edgeId: EdgeId
      index: number
      pointerId: number
      startWorld: Point
      origin: Point
      point: Point
    }
  | {
      kind: 'insert'
      edgeId: EdgeId
      index: number
      pointerId: number
      startWorld: Point
      origin: Point
      point: Point
    }
  | {
      kind: 'segment'
      edgeId: EdgeId
      index: number
      segmentIndex: number
      axis: 'x' | 'y'
      pointerId: number
      startWorld: Point
      origin: Point
      pathPoints: readonly Point[]
      baseRoutePoints: readonly Point[]
      routePoints: readonly Point[]
    }

export type EdgeRouteHandleDraft = {
  patch?: EdgePatch
  activeRouteIndex: number
}

export type EdgeRouteStart =
  | {
      kind: 'insert'
      edgeId: EdgeId
      index: number
      pointerId: number
      startWorld: Point
      origin: Point
      point: Point
    }
  | {
      kind: 'remove'
      edgeId: EdgeId
      index: number
    }
  | {
      kind: 'session'
      state: EdgeRouteHandleState
    }

export type EdgeRouteCommit =
  | {
      kind: 'move-point'
      edgeId: EdgeId
      index: number
      point: Point
    }
  | {
      kind: 'update-route'
      edgeId: EdgeId
      route: EdgePatch['route']
    }

type EdgeRoutePick = Extract<PointerDownInput['pick'], {
  kind: 'edge'
}> & {
  part: 'path'
}

const isEdgeRoutePick = (
  pick: PointerDownInput['pick']
): pick is EdgeRoutePick => (
  pick.kind === 'edge'
  && pick.part === 'path'
)

const readEditableEdgeView = (
  input: {
    readView: Pick<EditorHostDeps['projection']['query']['scene'], 'edge'>['edge']
    editable?: Pick<EditorHostDeps['projection']['query']['scene']['query']['edge'], 'editable'>['editable']
  },
  edgeId: EdgeId
) => input.editable?.(edgeId) ?? input.readView(edgeId)

const resolveEdgeRoutePickTarget = (
  projection: Pick<EditorHostDeps, 'projection'>['projection'],
  pick: PointerDownInput['pick']
): EdgeRouteHandleTarget | undefined => {
  if (!isEdgeRoutePick(pick)) {
    return undefined
  }

  const view = readEditableEdgeView({
    readView: projection.query.scene.edge,
    editable: projection.query.scene.query.edge.editable
  }, pick.id)
  if (!view) {
    return undefined
  }

  return edgeApi.edit.routeHandleTarget({
    edgeId: pick.id,
    handles: view.route.handles,
    pick: {
      index: pick.index,
      insert: pick.insert,
      segment: pick.segment
    }
  })
}

const readRoutePointIdAtIndex = (
  edge: Edge,
  index: number
) => edge.route?.kind === 'manual'
  ? edge.route.points[index]?.id
  : undefined

export const startEdgeRoutePoint = (input: {
  edgeId: EdgeId
  index: number
  pointerId: number
  startWorld: Point
  origin: Point
  point?: Point
}): EdgeRouteHandleState => ({
  kind: 'anchor',
  edgeId: input.edgeId,
  index: input.index,
  pointerId: input.pointerId,
  startWorld: input.startWorld,
  origin: input.origin,
  point: input.point ?? input.origin
})

const startEdgeRouteInsert = (input: {
  edgeId: EdgeId
  index: number
  pointerId: number
  startWorld: Point
  origin: Point
  point: Point
}): EdgeRouteHandleState => ({
  kind: 'insert',
  edgeId: input.edgeId,
  index: input.index,
  pointerId: input.pointerId,
  startWorld: input.startWorld,
  origin: input.origin,
  point: input.point
})

const startEdgeRouteSegment = (input: {
  edgeId: EdgeId
  index: number
  segmentIndex: number
  axis: 'x' | 'y'
  pointerId: number
  startWorld: Point
  origin: Point
  pathPoints: readonly Point[]
  baseRoutePoints: readonly Point[]
}): EdgeRouteHandleState => ({
  kind: 'segment',
  edgeId: input.edgeId,
  index: input.index,
  segmentIndex: input.segmentIndex,
  axis: input.axis,
  pointerId: input.pointerId,
  startWorld: input.startWorld,
  origin: input.origin,
  pathPoints: input.pathPoints,
  baseRoutePoints: input.baseRoutePoints,
  routePoints: input.baseRoutePoints
})

export const tryStartEdgeRoute = (input: {
  edge: Pick<EditorHostDeps, 'projection'>['projection']
  pointer: PointerDownInput
}): EdgeRouteStart | undefined => {
  const target = resolveEdgeRoutePickTarget(
    input.edge,
    input.pointer.pick
  )
  if (!target) {
    return undefined
  }

  if (target.kind === 'anchor' && input.pointer.detail >= 2) {
    return {
      kind: 'remove',
      edgeId: target.edgeId,
      index: target.index
    }
  }

  if (target.kind === 'anchor') {
    return {
      kind: 'session',
      state: startEdgeRoutePoint({
        edgeId: target.edgeId,
        index: target.index,
        pointerId: input.pointer.pointerId,
        startWorld: input.pointer.world,
        origin: target.point
      })
    }
  }

  const edge = input.edge.query.scene.edge(target.edgeId)?.base.edge
  const view = readEditableEdgeView({
    readView: input.edge.query.scene.edge,
    editable: input.edge.query.scene.query.edge.editable
  }, target.edgeId)

  if ((edge?.type === 'elbow' || edge?.type === 'fillet') && view) {
    return {
      kind: 'session',
      state: startEdgeRouteSegment({
        edgeId: target.edgeId,
        index: target.index,
        segmentIndex: target.segmentIndex,
        axis: target.axis,
        pointerId: input.pointer.pointerId,
        startWorld: input.pointer.world,
        origin: target.point,
        pathPoints: view.route.points,
        baseRoutePoints:
          edge.route?.kind === 'manual'
            ? edge.route.points
            : []
      })
    }
  }

  return {
    kind: 'insert',
    edgeId: target.edgeId,
    index: target.index,
    pointerId: input.pointer.pointerId,
    startWorld: input.pointer.world,
    origin: target.point,
    point: input.pointer.world
  }
}

export const removeEdgeRoutePoint = (
  ctx: Pick<EditorHostDeps, 'projection' | 'write'>,
  edgeId: EdgeId,
  index: number
) => {
  const edge = ctx.projection.query.scene.edge(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  const patch = edgeApi.route.remove(edge, index)
  if (!patch) {
    throw new Error(`Edge route point ${edgeId}:${index} not found.`)
  }

  ctx.write.edge.route.set(edgeId, patch.route ?? {
    kind: 'auto'
  })
}

const readProjectedRoutePoint = (
  state: Extract<EdgeRouteHandleState, { kind: 'anchor' | 'insert' }>,
  pointerWorld: Point
) => ({
  x: state.origin.x + (pointerWorld.x - state.startWorld.x),
  y: state.origin.y + (pointerWorld.y - state.startWorld.y)
})

const readInsertedRouteDraft = (
  edge: Edge,
  index: number,
  point: Point
): EdgeRouteHandleDraft | undefined => {
  const inserted = edgeApi.route.insert(edge, index, point)
  if (!inserted.ok) {
    return undefined
  }

  return {
    patch: inserted.data.patch,
    activeRouteIndex: inserted.data.index
  }
}

export const stepEdgeRoute = (input: {
  state: EdgeRouteHandleState
  edge: Edge
  pointerWorld: Point
}): {
  state: EdgeRouteHandleState
  draft?: EdgeRouteHandleDraft
} => {
  if (input.state.kind === 'segment') {
    const delta =
      input.state.axis === 'x'
        ? input.pointerWorld.x - input.state.startWorld.x
        : input.pointerWorld.y - input.state.startWorld.y
    if (delta === 0) {
      return {
        state: input.state
      }
    }

    const patch = edgeApi.edit.moveElbowRouteSegment({
      edge: input.edge,
      pathPoints: input.state.pathPoints,
      segmentIndex: input.state.segmentIndex,
      axis: input.state.axis,
      delta
    })
    if (!patch) {
      return {
        state: input.state
      }
    }

    return {
      state: {
        ...input.state,
        routePoints:
          patch.route?.kind === 'manual'
            ? patch.route.points
            : []
      },
      draft: {
        patch,
        activeRouteIndex: input.state.index
      }
    }
  }

  const point = readProjectedRoutePoint(input.state, input.pointerWorld)

  if (input.state.kind === 'insert') {
    if (geometryApi.equal.point(point, input.state.point)) {
      return {
        state: input.state,
        draft: readInsertedRouteDraft(
          input.edge,
          input.state.index,
          input.state.point
        )
      }
    }

    return {
      state: {
        ...input.state,
        point
      },
      draft: readInsertedRouteDraft(
        input.edge,
        input.state.index,
        point
      )
    }
  }

  if (geometryApi.equal.point(point, input.state.point)) {
    return {
      state: input.state,
      draft: geometryApi.equal.point(input.state.point, input.state.origin)
        ? undefined
        : {
            patch: edgeApi.route.move(input.edge, input.state.index, input.state.point),
            activeRouteIndex: input.state.index
          }
    }
  }

  return {
    state: {
      ...input.state,
      point
    },
    draft: {
      patch: edgeApi.route.move(input.edge, input.state.index, point),
      activeRouteIndex: input.state.index
    }
  }
}

const commitEdgeRoute = (
  state: EdgeRouteHandleState,
  edge: Edge
): EdgeRouteCommit | undefined => {
  if (state.kind === 'insert') {
    const inserted = edgeApi.route.insert(edge, state.index, state.point)
    if (!inserted.ok) {
      return undefined
    }

    return {
      kind: 'update-route',
      edgeId: state.edgeId,
      route: inserted.data.patch.route
    }
  }

  if (state.kind === 'anchor') {
    return geometryApi.equal.point(state.point, state.origin)
      ? undefined
      : {
          kind: 'move-point',
          edgeId: state.edgeId,
          index: state.index,
          point: state.point
        }
  }

  if (edgeApi.edit.areRoutePointsEqual(state.routePoints, state.baseRoutePoints)) {
    return undefined
  }

  return {
    kind: 'update-route',
    edgeId: state.edgeId,
    route:
      state.routePoints.length > 0
        ? {
            kind: 'manual',
            points: [...state.routePoints]
          }
        : {
            kind: 'auto'
          }
  }
}

const readViewportWorld = (
  ctx: Pick<EditorHostDeps, 'sessionRead'>,
  pointer: {
    clientX: number
    clientY: number
  }
) => ctx.sessionRead.viewport.pointer(pointer).world

const readRouteGesture = (
  state: EdgeRouteHandleState,
  patch?: ReturnType<typeof stepEdgeRoute>['draft']
) => createGesture(
  'edge-route',
  {
    edgePatches: [{
      id: state.edgeId,
      activeRouteIndex: state.index,
      ...(patch?.patch
        ? {
            patch: patch.patch
          }
        : {})
    }]
  }
)

const submitEdgeRouteCommit = (
  ctx: Pick<EditorHostDeps, 'projection' | 'write'>,
  commit: EdgeRouteCommit | undefined
) => {
  if (!commit) {
    return
  }

  if (commit.kind === 'update-route') {
    ctx.write.edge.route.set(commit.edgeId, commit.route ?? {
      kind: 'auto'
    })
    return
  }

  const edge = ctx.projection.query.scene.edge(commit.edgeId)?.base.edge
  const pointId = edge
    ? readRoutePointIdAtIndex(edge, commit.index)
    : undefined
  if (pointId) {
    ctx.write.edge.route.update(commit.edgeId, pointId, commit.point)
  }
}

const createEdgeRouteSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'write'>,
  initial: EdgeRouteHandleState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null
  const baseEdge = ctx.projection.query.scene.edge(initial.edgeId)?.base.edge

  const step = (
    pointer: {
      clientX: number
      clientY: number
    }
  ) => {
    const edge = ctx.projection.query.scene.edge(state.edgeId)?.base.edge
    if (!edge || !baseEdge || !readEditableEdgeView({
      readView: ctx.projection.query.scene.edge,
      editable: ctx.projection.query.scene.query.edge.editable
    }, state.edgeId)) {
      return CANCEL
    }

    const result = stepEdgeRoute({
      state,
      edge: baseEdge,
      pointerWorld: readViewportWorld(ctx, pointer)
    })
    state = result.state
    interaction!.gesture = readRouteGesture(
      state,
      result.draft
    )
  }

  interaction = {
    mode: 'edge-route',
    pointerId: state.pointerId,
    chrome: false,
    gesture: readRouteGesture(state),
    autoPan: {
      frame: (pointer) => step(pointer)
    },
    move: (input) => {
      const transition = step({
        clientX: input.client.x,
        clientY: input.client.y
      })
      if (transition) {
        return transition
      }
    },
    up: (input) => {
      const transition = step({
        clientX: input.client.x,
        clientY: input.client.y
      })
      if (transition) {
        return transition
      }
      if (!baseEdge) {
        return FINISH
      }

      submitEdgeRouteCommit(ctx, commitEdgeRoute(state, baseEdge))

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

const createInsertedRouteSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'write'>,
  input: Extract<EdgeRouteStart, { kind: 'insert' }>
) => createEdgeRouteSession(
  ctx,
  startEdgeRouteInsert({
    edgeId: input.edgeId,
    index: input.index,
    pointerId: input.pointerId,
    startWorld: input.startWorld,
    origin: input.origin,
    point: input.point
  })
)

const commitInsertedRoute = (
  ctx: Pick<EditorHostDeps, 'projection' | 'write'>,
  input: Extract<EdgeRouteStart, { kind: 'insert' }>
) => {
  const edge = ctx.projection.query.scene.edge(input.edgeId)?.base.edge
  if (!edge) {
    return null
  }

  submitEdgeRouteCommit(
    ctx,
    commitEdgeRoute(
      startEdgeRouteInsert({
        edgeId: input.edgeId,
        index: input.index,
        pointerId: input.pointerId,
        startWorld: input.startWorld,
        origin: input.origin,
        point: input.point
      }),
      edge
    )
  )
}

export const createEdgeRoutePressSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'write'>,
  start: PointerDownInput,
  plan: Extract<EdgeRouteStart, { kind: 'session' | 'insert' }>
): InteractionSession => createPressDragSession({
  start,
  chrome: true,
  createDragSession: () => (
    plan.kind === 'session'
      ? createEdgeRouteSession(ctx, plan.state)
      : createInsertedRouteSession(ctx, plan)
  ),
  onTap: () => {
    if (plan.kind === 'insert') {
      commitInsertedRoute(ctx, plan)
    }
  }
})

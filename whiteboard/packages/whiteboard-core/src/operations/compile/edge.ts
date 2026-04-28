import { json } from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import { edge as edgeApi } from '@whiteboard/core/edge'
import {
  createEdgeLabelPatch,
  createEdgePatch
} from '@whiteboard/core/edge/update'
import type {
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable
} from '@whiteboard/core/operations/compile/helpers'
import {
  failCancelled,
  failInvalid,
  readCompileRegistries,
  readCompileServices,
  requireEdge
} from '@whiteboard/core/operations/compile/helpers'
import { resolveLockDecision } from '@whiteboard/core/operations/lock'
import type {
  Edge,
  EdgeFieldPatch,
  EdgeId,
  EdgeLabel,
  EdgeLabelFieldPatch,
  EdgePatch,
  EdgeRoutePoint,
  EdgeUpdateInput,
  Operation,
  Point
} from '@whiteboard/core/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const buildScopedRecordWrite = (
  scope: 'data' | 'style',
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): RecordWrite | undefined => {
  if (current === undefined && next === undefined) {
    return undefined
  }

  if (next === undefined) {
    return Object.freeze({
      [scope]: undefined
    })
  }

  if (current === undefined) {
    return Object.freeze({
      [scope]: json.clone(next)
    })
  }

  const diff = draftRecord.diff(current, next)
  if (!Object.keys(diff).length) {
    return undefined
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(diff).map(([path, value]) => [
        `${scope}.${path}`,
        value
      ])
    )
  )
}

const mergeRecordWrites = (
  ...writes: Array<RecordWrite | undefined>
): RecordWrite | undefined => {
  const merged: Record<string, unknown> = {}

  writes.forEach((write) => {
    if (!write) {
      return
    }

    Object.entries(write).forEach(([path, value]) => {
      merged[path] = json.clone(value)
    })
  })

  return Object.keys(merged).length
    ? Object.freeze(merged)
    : undefined
}

const compactRecordWrite = (
  base: object,
  record?: RecordWrite
): RecordWrite | undefined => {
  if (!record) {
    return undefined
  }

  const compact: Record<string, unknown> = {}
  Object.entries(record).forEach(([path, value]) => {
    if (value === undefined) {
      if (draftRecord.has(base, path)) {
        compact[path] = undefined
      }
      return
    }

    if (!json.equal(draftRecord.read(base, path), value)) {
      compact[path] = json.clone(value)
    }
  })

  return Object.keys(compact).length
    ? Object.freeze(compact)
    : undefined
}

const buildEdgeFieldPatch = (
  edge: Edge,
  fields?: EdgeUpdateInput['fields']
): EdgeFieldPatch | undefined => {
  if (!fields) {
    return undefined
  }

  const patch: EdgeFieldPatch = {}
  if (hasOwn(fields, 'source') && !edgeApi.equal.sameEnd(edge.source, fields.source)) {
    patch.source = json.clone(fields.source)
  }
  if (hasOwn(fields, 'target') && !edgeApi.equal.sameEnd(edge.target, fields.target)) {
    patch.target = json.clone(fields.target)
  }
  if (hasOwn(fields, 'type') && !json.equal(edge.type, fields.type)) {
    patch.type = json.clone(fields.type)
  }
  if (hasOwn(fields, 'locked') && !json.equal(edge.locked, fields.locked)) {
    patch.locked = json.clone(fields.locked)
  }
  if (hasOwn(fields, 'groupId') && !json.equal(edge.groupId, fields.groupId)) {
    patch.groupId = json.clone(fields.groupId)
  }
  if (hasOwn(fields, 'textMode') && !json.equal(edge.textMode, fields.textMode)) {
    patch.textMode = json.clone(fields.textMode)
  }

  return Object.keys(patch).length
    ? patch
    : undefined
}

const buildEdgeLabelFieldPatch = (
  label: EdgeLabel,
  fields?: EdgeLabelFieldPatch
): EdgeLabelFieldPatch | undefined => {
  if (!fields) {
    return undefined
  }

  const patch: EdgeLabelFieldPatch = {}
  if (hasOwn(fields, 'text') && !json.equal(label.text, fields.text)) {
    patch.text = json.clone(fields.text)
  }
  if (hasOwn(fields, 't') && !json.equal(label.t, fields.t)) {
    patch.t = json.clone(fields.t)
  }
  if (hasOwn(fields, 'offset') && !json.equal(label.offset, fields.offset)) {
    patch.offset = json.clone(fields.offset)
  }

  return Object.keys(patch).length
    ? patch
    : undefined
}

const emitEdgeRouteDiffOps = (
  edgeId: EdgeId,
  currentPoints: readonly EdgeRoutePoint[],
  nextPoints: readonly Point[],
  ctx: WhiteboardCompileContext
) => {
  const samePoint = (left: Point | undefined, right: Point | undefined) => (
    left?.x === right?.x && left?.y === right?.y
  )

  let prefix = 0
  while (
    prefix < currentPoints.length
    && prefix < nextPoints.length
    && samePoint(currentPoints[prefix], nextPoints[prefix])
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix + prefix < currentPoints.length
    && suffix + prefix < nextPoints.length
    && samePoint(
      currentPoints[currentPoints.length - 1 - suffix],
      nextPoints[nextPoints.length - 1 - suffix]
    )
  ) {
    suffix += 1
  }

  const currentMiddle = currentPoints.slice(prefix, currentPoints.length - suffix)
  const nextMiddle = nextPoints.slice(prefix, nextPoints.length - suffix)

  if (currentMiddle.length === 0 && nextMiddle.length === 0) {
    return
  }

  if (currentMiddle.length === 0) {
    let to: Extract<Operation, { type: 'edge.route.point.insert' }>['to'] = prefix === 0
      ? { kind: 'start' }
      : {
          kind: 'after',
          pointId: currentPoints[prefix - 1]!.id
        }

    nextMiddle.forEach((point) => {
      const routePoint: EdgeRoutePoint = {
        id: readCompileServices(ctx).ids.edgeRoutePoint(),
        x: point.x,
        y: point.y
      }
      ctx.emit({
        type: 'edge.route.point.insert',
        edgeId,
        point: routePoint,
        to
      })
      to = {
        kind: 'after',
        pointId: routePoint.id
      }
    })
    return
  }

  if (nextMiddle.length === 0) {
    currentMiddle.forEach((point) => {
      ctx.emit({
        type: 'edge.route.point.delete',
        edgeId,
        pointId: point.id
      })
    })
    return
  }

  if (currentMiddle.length === nextMiddle.length) {
    currentMiddle.forEach((point, index) => {
      const nextPoint = nextMiddle[index]!
      const fields: Partial<Record<'x' | 'y', number>> = {}
      if (point.x !== nextPoint.x) {
        fields.x = nextPoint.x
      }
      if (point.y !== nextPoint.y) {
        fields.y = nextPoint.y
      }
      if (Object.keys(fields).length) {
        ctx.emit({
          type: 'edge.route.point.patch',
          edgeId,
          pointId: point.id,
          patch: fields
        })
      }
    })
    return
  }

  currentPoints.forEach((point) => {
    ctx.emit({
      type: 'edge.route.point.delete',
      edgeId,
      pointId: point.id
    })
  })

  let to: Extract<Operation, { type: 'edge.route.point.insert' }>['to'] = { kind: 'start' }
  nextPoints.forEach((point) => {
    const routePoint: EdgeRoutePoint = {
      id: readCompileServices(ctx).ids.edgeRoutePoint(),
      x: point.x,
      y: point.y
    }
    ctx.emit({
      type: 'edge.route.point.insert',
      edgeId,
      point: routePoint,
      to
    })
    to = {
      kind: 'after',
      pointId: routePoint.id
    }
  })
}

const emitEdgeUpdateInputOps = (
  edge: Edge,
  input: EdgeUpdateInput,
  ctx: WhiteboardCompileContext
) => {
  const fields = buildEdgeFieldPatch(edge, input.fields)
  const record = compactRecordWrite(edge, input.record)
  if (!fields && !record) {
    return
  }

  ctx.emit({
    type: 'edge.patch',
    id: edge.id,
    patch: createEdgePatch({
      ...(fields ? { fields } : {}),
      ...(record ? { record } : {})
    })
  })
}

export const emitEdgeMovePatchOps = (
  edge: Edge,
  patch: EdgePatch,
  ctx: WhiteboardCompileContext
) => {
  const fields: EdgeFieldPatch = {}
  if (patch.source) {
    fields.source = patch.source
  }
  if (patch.target) {
    fields.target = patch.target
  }
  if (patch.type) {
    fields.type = patch.type
  }
  if (hasOwn(patch, 'locked')) {
    fields.locked = patch.locked
  }
  if (hasOwn(patch, 'groupId')) {
    fields.groupId = patch.groupId
  }
  if (hasOwn(patch, 'textMode')) {
    fields.textMode = patch.textMode
  }

  const record = mergeRecordWrites(
    hasOwn(patch, 'data')
      ? buildScopedRecordWrite('data', edge.data, patch.data)
      : undefined,
    hasOwn(patch, 'style')
      ? buildScopedRecordWrite('style', edge.style, patch.style)
      : undefined
  )

  emitEdgeUpdateInputOps(edge, {
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(record ? { record } : {})
  }, ctx)

  if (hasOwn(patch, 'route')) {
    emitEdgeRouteDiffOps(
      edge.id,
      edge.route?.kind === 'manual' ? edge.route.points : [],
      patch.route?.kind === 'manual' ? patch.route.points : [],
      ctx
    )
  }
}

const compileEdgeRouteDelete = (
  edge: Edge,
  pointId: string,
  ctx: WhiteboardCompileContext
) => {
  const point = edge.route?.kind === 'manual'
    ? edge.route.points.find((entry) => entry.id === pointId)
    : undefined
  if (!point) {
    return failInvalid(ctx, `Edge ${edge.id} route point not found.`)
  }

  ctx.emit({
    type: 'edge.route.point.delete',
    edgeId: edge.id,
    pointId
  })
}

type EdgeIntentHandlers = Pick<
  WhiteboardCompileHandlerTable,
  'edge.create'
  | 'edge.update'
  | 'edge.move'
  | 'edge.reconnect.commit'
  | 'edge.delete'
  | 'edge.label.insert'
  | 'edge.label.update'
  | 'edge.label.move'
  | 'edge.label.delete'
  | 'edge.route.insert'
  | 'edge.route.update'
  | 'edge.route.set'
  | 'edge.route.move'
  | 'edge.route.delete'
  | 'edge.route.clear'
>

const failLockedEdgeModification = (
  ctx: WhiteboardCompileContext,
  reason?: import('@whiteboard/core/operations/lock').LockDecisionReason
) => failCancelled(
  ctx,
  reason === 'locked-node'
    ? 'Locked nodes cannot be modified.'
    : reason === 'locked-edge'
      ? 'Locked edges cannot be modified.'
      : 'Locked node relations cannot be modified.'
)

export const edgeIntentHandlers: EdgeIntentHandlers = {
  'edge.create': (ctx) => {
    const document = ctx.document
    const built = edgeApi.op.create({
      payload: ctx.intent.input,
      doc: document,
      registries: readCompileRegistries(ctx),
      createEdgeId: readCompileServices(ctx).ids.edge,
      createEdgeRoutePointId: readCompileServices(ctx).ids.edgeRoutePoint
    })
    if (!built.ok) {
      return failInvalid(ctx, built.error.message, built.error.details)
    }

    ctx.emit(built.data.operation)
    ctx.output({
      edgeId: built.data.edgeId
    })
  },
  'edge.update': (ctx) => {
    const document = ctx.document
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: ctx.intent.updates.map((entry) => entry.id)
      }
    })
    if (!decision.allowed) {
      return failLockedEdgeModification(ctx, decision.reason)
    }

    ctx.intent.updates.forEach((entry) => {
      const edge = ctx.document.edges[entry.id]
      if (!edge) {
        return
      }
      emitEdgeUpdateInputOps(edge, entry.input, ctx)
    })
  },
  'edge.move': (ctx) => {
    const {
      intent,
      document
    } = ctx
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: intent.ids
      }
    })
    if (!decision.allowed) {
      return failLockedEdgeModification(ctx, decision.reason)
    }

    intent.ids.forEach((edgeId) => {
      const edge = ctx.document.edges[edgeId]
      const patch = edge ? edgeApi.edit.move(edge, intent.delta) : undefined
      if (!edge || !patch) {
        return
      }
      emitEdgeMovePatchOps(edge, patch, ctx)
    })
  },
  'edge.reconnect.commit': (ctx) => {
    const {
      intent,
      document
    } = ctx
    const currentDecision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: [intent.edgeId]
      }
    })
    if (!currentDecision.allowed) {
      return failLockedEdgeModification(ctx, currentDecision.reason)
    }

    const targetDecision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ends',
        ends: [intent.target]
      }
    })
    if (!targetDecision.allowed) {
      return failLockedEdgeModification(ctx, targetDecision.reason)
    }

    const edge = ctx.document.edges[intent.edgeId]
    if (!edge) {
      return
    }

    emitEdgeMovePatchOps(edge, {
      ...(intent.end === 'source'
        ? { source: intent.target }
        : { target: intent.target }),
      ...(intent.patch?.type
        ? {
            type: intent.patch.type
          }
        : {}),
      ...(intent.patch?.route
        ? {
            route: intent.patch.route
          }
        : {})
    }, ctx)
  },
  'edge.delete': (ctx) => {
    const document = ctx.document
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: ctx.intent.ids
      }
    })
    if (!decision.allowed) {
      return failLockedEdgeModification(ctx, decision.reason)
    }

    ctx.intent.ids.forEach((id) => {
      ctx.emit({
        type: 'edge.delete',
        id
      })
    })
  },
  'edge.label.insert': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }

    const labelId = readCompileServices(ctx).ids.edgeLabel()
    const label: EdgeLabel = {
      id: labelId,
      ...(ctx.intent.label.text !== undefined ? { text: ctx.intent.label.text } : {}),
      ...(ctx.intent.label.t !== undefined ? { t: ctx.intent.label.t } : {}),
      ...(ctx.intent.label.offset !== undefined ? { offset: ctx.intent.label.offset } : {}),
      ...(ctx.intent.label.style !== undefined ? { style: ctx.intent.label.style } : {}),
      ...(ctx.intent.label.data !== undefined ? { data: ctx.intent.label.data } : {})
    }
    ctx.emit({
      type: 'edge.label.insert',
      edgeId: edge.id,
      label,
      to: ctx.intent.to ?? { kind: 'end' }
    })
    ctx.output({
      labelId
    })
  },
  'edge.label.update': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }

    const label = edge.labels?.find((entry) => entry.id === ctx.intent.labelId)
    if (!label) {
      return failInvalid(ctx, `Edge label ${ctx.intent.labelId} not found.`)
    }

    const fields = buildEdgeLabelFieldPatch(label, ctx.intent.input.fields)
    const record = compactRecordWrite(label, ctx.intent.input.record)
    if (!fields && !record) {
      return
    }

    ctx.emit({
      type: 'edge.label.patch',
      edgeId: edge.id,
      labelId: label.id,
      patch: createEdgeLabelPatch({
        ...(fields ? { fields } : {}),
        ...(record ? { record } : {})
      })
    })
  },
  'edge.label.move': (ctx) => {
    ctx.emit({
      type: 'edge.label.move',
      edgeId: ctx.intent.edgeId,
      labelId: ctx.intent.labelId,
      to: ctx.intent.to
    })
  },
  'edge.label.delete': (ctx) => {
    ctx.emit({
      type: 'edge.label.delete',
      edgeId: ctx.intent.edgeId,
      labelId: ctx.intent.labelId
    })
  },
  'edge.route.insert': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }

    const pointId = readCompileServices(ctx).ids.edgeRoutePoint()
    ctx.emit({
      type: 'edge.route.point.insert',
      edgeId: edge.id,
      point: {
        id: pointId,
        x: ctx.intent.point.x,
        y: ctx.intent.point.y
      },
      to: ctx.intent.to ?? { kind: 'end' }
    })
    ctx.output({
      pointId
    })
  },
  'edge.route.update': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }

    const point = edge.route?.kind === 'manual'
      ? edge.route.points.find((entry) => entry.id === ctx.intent.pointId)
      : undefined
    if (!point) {
      return failInvalid(ctx, `Edge ${edge.id} route point not found.`)
    }

    const fields: Partial<Record<'x' | 'y', number>> = {}
    if (ctx.intent.fields.x !== undefined && point.x !== ctx.intent.fields.x) {
      fields.x = ctx.intent.fields.x
    }
    if (ctx.intent.fields.y !== undefined && point.y !== ctx.intent.fields.y) {
      fields.y = ctx.intent.fields.y
    }
    if (!Object.keys(fields).length) {
      return
    }

    ctx.emit({
      type: 'edge.route.point.patch',
      edgeId: edge.id,
      pointId: point.id,
      patch: fields
    })
  },
  'edge.route.set': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }
    emitEdgeRouteDiffOps(
      edge.id,
      edge.route?.kind === 'manual' ? edge.route.points : [],
      ctx.intent.route.kind === 'manual' ? ctx.intent.route.points : [],
      ctx
    )
  },
  'edge.route.move': (ctx) => {
    ctx.emit({
      type: 'edge.route.point.move',
      edgeId: ctx.intent.edgeId,
      pointId: ctx.intent.pointId,
      to: ctx.intent.to
    })
  },
  'edge.route.delete': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }
    return compileEdgeRouteDelete(edge, ctx.intent.pointId, ctx)
  },
  'edge.route.clear': (ctx) => {
    const edge = requireEdge(ctx, ctx.intent.edgeId)
    if (!edge) {
      return
    }
    if (edge.route?.kind !== 'manual') {
      return
    }
    edge.route.points.forEach((point) => {
      ctx.emit({
        type: 'edge.route.point.delete',
        edgeId: edge.id,
        pointId: point.id
      })
    })
  }
}

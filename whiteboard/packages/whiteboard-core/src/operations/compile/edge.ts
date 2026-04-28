import { json } from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type { MutationCompileHandlerTable } from '@shared/mutation'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type { WhiteboardCompileScope } from '@whiteboard/core/operations/compile/scope'
import type {
  EdgeIntent,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intent-types'
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
  ctx: WhiteboardCompileScope
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
        id: ctx.ids.edgeRoutePoint(),
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
          fields
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
      id: ctx.ids.edgeRoutePoint(),
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
  ctx: WhiteboardCompileScope
) => {
  const fields = buildEdgeFieldPatch(edge, input.fields)
  const record = compactRecordWrite(edge, input.record)
  if (!fields && !record) {
    return
  }

  ctx.emit({
    type: 'edge.patch',
    id: edge.id,
    ...(fields ? { fields } : {}),
    ...(record ? { record } : {})
  })
}

export const emitEdgeMovePatchOps = (
  edge: Edge,
  patch: EdgePatch,
  ctx: WhiteboardCompileScope
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
  ctx: WhiteboardCompileScope
) => {
  const point = edge.route?.kind === 'manual'
    ? edge.route.points.find((entry) => entry.id === pointId)
    : undefined
  if (!point) {
    return ctx.fail.invalid(`Edge ${edge.id} route point not found.`)
  }

  ctx.emit({
    type: 'edge.route.point.delete',
    edgeId: edge.id,
    pointId
  })
}

type EdgeIntentHandlers = Pick<
  MutationCompileHandlerTable<
    WhiteboardMutationTable,
    WhiteboardCompileScope,
    'invalid' | 'cancelled'
  >,
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

export const edgeIntentHandlers: EdgeIntentHandlers = {
  'edge.create': (intent, ctx) => {
    const document = ctx.read.document()
    const built = edgeApi.op.create({
      payload: intent.input,
      doc: document,
      registries: ctx.registries,
      createEdgeId: ctx.ids.edge,
      createEdgeRoutePointId: ctx.ids.edgeRoutePoint
    })
    if (!built.ok) {
      return ctx.fail.invalid(built.error.message, built.error.details)
    }

    ctx.emit(built.data.operation)
    return {
      edgeId: built.data.edgeId
    }
  },
  'edge.update': (intent, ctx) => {
    const document = ctx.read.document()
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: intent.updates.map((entry) => entry.id)
      }
    })
    if (!decision.allowed) {
      return ctx.fail.cancelled(
        decision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : decision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    intent.updates.forEach((entry) => {
      const edge = ctx.read.edge(entry.id)
      if (!edge) {
        return
      }
      emitEdgeUpdateInputOps(edge, entry.input, ctx)
    })
  },
  'edge.move': (intent, ctx) => {
    const document = ctx.read.document()
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: intent.ids
      }
    })
    if (!decision.allowed) {
      return ctx.fail.cancelled(
        decision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : decision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    intent.ids.forEach((edgeId) => {
      const edge = ctx.read.edge(edgeId)
      const patch = edge ? edgeApi.edit.move(edge, intent.delta) : undefined
      if (!edge || !patch) {
        return
      }
      emitEdgeMovePatchOps(edge, patch, ctx)
    })
  },
  'edge.reconnect.commit': (intent, ctx) => {
    const document = ctx.read.document()
    const currentDecision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: [intent.edgeId]
      }
    })
    if (!currentDecision.allowed) {
      return ctx.fail.cancelled(
        currentDecision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : currentDecision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    const targetDecision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ends',
        ends: [intent.target]
      }
    })
    if (!targetDecision.allowed) {
      return ctx.fail.cancelled(
        targetDecision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : targetDecision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    const edge = ctx.read.edge(intent.edgeId)
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
  'edge.delete': (intent, ctx) => {
    const document = ctx.read.document()
    const decision = resolveLockDecision({
      document,
      target: {
        kind: 'edge-ids',
        edgeIds: intent.ids
      }
    })
    if (!decision.allowed) {
      return ctx.fail.cancelled(
        decision.reason === 'locked-node'
          ? 'Locked nodes cannot be modified.'
          : decision.reason === 'locked-edge'
            ? 'Locked edges cannot be modified.'
            : 'Locked node relations cannot be modified.'
      )
    }

    intent.ids.forEach((id) => {
      ctx.emit({
        type: 'edge.delete',
        id
      })
    })
  },
  'edge.label.insert': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
    if (!edge) {
      return
    }

    const labelId = ctx.ids.edgeLabel()
    const label: EdgeLabel = {
      id: labelId,
      ...(intent.label.text !== undefined ? { text: intent.label.text } : {}),
      ...(intent.label.t !== undefined ? { t: intent.label.t } : {}),
      ...(intent.label.offset !== undefined ? { offset: intent.label.offset } : {}),
      ...(intent.label.style !== undefined ? { style: intent.label.style } : {}),
      ...(intent.label.data !== undefined ? { data: intent.label.data } : {})
    }
    ctx.emit({
      type: 'edge.label.insert',
      edgeId: edge.id,
      label,
      to: intent.to ?? { kind: 'end' }
    })
    return {
      labelId
    }
  },
  'edge.label.update': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
    if (!edge) {
      return
    }

    const label = edge.labels?.find((entry) => entry.id === intent.labelId)
    if (!label) {
      return ctx.fail.invalid(`Edge label ${intent.labelId} not found.`)
    }

    const fields = buildEdgeLabelFieldPatch(label, intent.input.fields)
    const record = compactRecordWrite(label, intent.input.record)
    if (!fields && !record) {
      return
    }

    ctx.emit({
      type: 'edge.label.patch',
      edgeId: edge.id,
      labelId: label.id,
      ...(fields ? { fields } : {}),
      ...(record ? { record } : {})
    })
  },
  'edge.label.move': (intent, ctx) => {
    ctx.emit({
      type: 'edge.label.move',
      edgeId: intent.edgeId,
      labelId: intent.labelId,
      to: intent.to
    })
  },
  'edge.label.delete': (intent, ctx) => {
    ctx.emit({
      type: 'edge.label.delete',
      edgeId: intent.edgeId,
      labelId: intent.labelId
    })
  },
  'edge.route.insert': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
    if (!edge) {
      return
    }

    const pointId = ctx.ids.edgeRoutePoint()
    ctx.emit({
      type: 'edge.route.point.insert',
      edgeId: edge.id,
      point: {
        id: pointId,
        x: intent.point.x,
        y: intent.point.y
      },
      to: intent.to ?? { kind: 'end' }
    })
    return {
      pointId
    }
  },
  'edge.route.update': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
    if (!edge) {
      return
    }

    const point = edge.route?.kind === 'manual'
      ? edge.route.points.find((entry) => entry.id === intent.pointId)
      : undefined
    if (!point) {
      return ctx.fail.invalid(`Edge ${edge.id} route point not found.`)
    }

    const fields: Partial<Record<'x' | 'y', number>> = {}
    if (intent.fields.x !== undefined && point.x !== intent.fields.x) {
      fields.x = intent.fields.x
    }
    if (intent.fields.y !== undefined && point.y !== intent.fields.y) {
      fields.y = intent.fields.y
    }
    if (!Object.keys(fields).length) {
      return
    }

    ctx.emit({
      type: 'edge.route.point.patch',
      edgeId: edge.id,
      pointId: point.id,
      fields
    })
  },
  'edge.route.set': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
    if (!edge) {
      return
    }
    emitEdgeRouteDiffOps(
      edge.id,
      edge.route?.kind === 'manual' ? edge.route.points : [],
      intent.route.kind === 'manual' ? intent.route.points : [],
      ctx
    )
  },
  'edge.route.move': (intent, ctx) => {
    ctx.emit({
      type: 'edge.route.point.move',
      edgeId: intent.edgeId,
      pointId: intent.pointId,
      to: intent.to
    })
  },
  'edge.route.delete': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
    if (!edge) {
      return
    }
    return compileEdgeRouteDelete(edge, intent.pointId, ctx)
  },
  'edge.route.clear': (intent, ctx) => {
    const edge = ctx.read.requireEdge(intent.edgeId)
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

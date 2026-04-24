import { json } from '@shared/core'
import {
  path as mutationPath,
  type Path
} from '@shared/mutation'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { resolveLockDecision } from '@whiteboard/core/lock'
import type {
  Edge,
  EdgeId,
  EdgeLabel,
  EdgePatch,
  EdgeRoutePoint,
  EdgeUpdateInput,
  Operation,
  Point
} from '@whiteboard/core/types'
import type { WhiteboardIntentContext } from '@whiteboard/core/intent/context'
import type { EdgeIntent } from '@whiteboard/core/intent/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const isRecordTree = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const appendRecordSetPaths = (
  path: Path,
  value: unknown,
  emitSet: (path: Path, value: unknown) => void
) => {
  if (isRecordTree(value) && Object.keys(value).length > 0) {
    Object.entries(value).forEach(([key, entry]) => {
      appendRecordSetPaths(
        mutationPath.append(path, key),
        entry,
        emitSet
      )
    })
    return
  }

  if (!path.length) {
    return
  }
  emitSet(path, value)
}

const appendRecordUnsetPaths = (
  path: Path,
  value: unknown,
  emitUnset: (path: Path) => void
) => {
  if (isRecordTree(value) && Object.keys(value).length > 0) {
    Object.entries(value).forEach(([key, entry]) => {
      appendRecordUnsetPaths(
        mutationPath.append(path, key),
        entry,
        emitUnset
      )
    })
    return
  }

  if (!path.length) {
    return
  }
  emitUnset(path)
}

const diffRecordTrees = ({
  current,
  next,
  emitSet,
  emitUnset,
  path = mutationPath.root()
}: {
  current: unknown
  next: unknown
  emitSet: (path: Path, value: unknown) => void
  emitUnset: (path: Path) => void
  path?: Path
}) => {
  if (json.equal(current, next)) {
    return
  }

  if (isRecordTree(current) && isRecordTree(next)) {
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(next)
    ])

    keys.forEach((key) => {
      const childPath = mutationPath.append(path, key)
      if (!hasOwn(next, key)) {
        appendRecordUnsetPaths(childPath, current[key], emitUnset)
        return
      }
      if (!hasOwn(current, key)) {
        appendRecordSetPaths(childPath, next[key], emitSet)
        return
      }
      diffRecordTrees({
        current: current[key],
        next: next[key],
        emitSet,
        emitUnset,
        path: childPath
      })
    })
    return
  }

  if (next === undefined) {
    appendRecordUnsetPaths(path, current, emitUnset)
    return
  }

  if (!path.length) {
    appendRecordSetPaths(path, next, emitSet)
    return
  }

  emitSet(path, next)
}

const emitEdgeRouteDiffOps = (
  edgeId: EdgeId,
  currentPoints: readonly EdgeRoutePoint[],
  nextPoints: readonly Point[],
  ctx: WhiteboardIntentContext
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
        id: ctx.tx.ids.edgeRoutePoint(),
        x: point.x,
        y: point.y
      }
      ctx.tx.emit({
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
      ctx.tx.emit({
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
      if (point.x !== nextPoint.x) {
        ctx.tx.emit({
          type: 'edge.route.point.field.set',
          edgeId,
          pointId: point.id,
          field: 'x',
          value: nextPoint.x
        })
      }
      if (point.y !== nextPoint.y) {
        ctx.tx.emit({
          type: 'edge.route.point.field.set',
          edgeId,
          pointId: point.id,
          field: 'y',
          value: nextPoint.y
        })
      }
    })
    return
  }

  currentPoints.forEach((point) => {
    ctx.tx.emit({
      type: 'edge.route.point.delete',
      edgeId,
      pointId: point.id
    })
  })

  let to: Extract<Operation, { type: 'edge.route.point.insert' }>['to'] = { kind: 'start' }
  nextPoints.forEach((point) => {
    const routePoint: EdgeRoutePoint = {
      id: ctx.tx.ids.edgeRoutePoint(),
      x: point.x,
      y: point.y
    }
    ctx.tx.emit({
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
  ctx: WhiteboardIntentContext
) => {
  const fields = input.fields

  if (fields?.source && !edgeApi.equal.sameEnd(edge.source, fields.source)) {
    ctx.tx.emit({
      type: 'edge.field.set',
      id: edge.id,
      field: 'source',
      value: fields.source
    })
  }
  if (fields?.target && !edgeApi.equal.sameEnd(edge.target, fields.target)) {
    ctx.tx.emit({
      type: 'edge.field.set',
      id: edge.id,
      field: 'target',
      value: fields.target
    })
  }
  if (fields?.type && edge.type !== fields.type) {
    ctx.tx.emit({
      type: 'edge.field.set',
      id: edge.id,
      field: 'type',
      value: fields.type
    })
  }
  if (fields && hasOwn(fields, 'locked') && edge.locked !== fields.locked) {
    if (fields.locked === undefined) {
      ctx.tx.emit({
        type: 'edge.field.unset',
        id: edge.id,
        field: 'locked'
      })
    } else {
      ctx.tx.emit({
        type: 'edge.field.set',
        id: edge.id,
        field: 'locked',
        value: fields.locked
      })
    }
  }
  if (fields && hasOwn(fields, 'groupId') && edge.groupId !== fields.groupId) {
    if (fields.groupId === undefined) {
      ctx.tx.emit({
        type: 'edge.field.unset',
        id: edge.id,
        field: 'groupId'
      })
    } else {
      ctx.tx.emit({
        type: 'edge.field.set',
        id: edge.id,
        field: 'groupId',
        value: fields.groupId
      })
    }
  }
  if (fields && hasOwn(fields, 'textMode') && edge.textMode !== fields.textMode) {
    if (fields.textMode === undefined) {
      ctx.tx.emit({
        type: 'edge.field.unset',
        id: edge.id,
        field: 'textMode'
      })
    } else {
      ctx.tx.emit({
        type: 'edge.field.set',
        id: edge.id,
        field: 'textMode',
        value: fields.textMode
      })
    }
  }

  for (const record of input.records ?? []) {
    if (record.op === 'unset') {
      ctx.tx.emit({
        type: 'edge.record.unset',
        id: edge.id,
        scope: record.scope,
        path: record.path
      })
      continue
    }

    ctx.tx.emit({
      type: 'edge.record.set',
      id: edge.id,
      scope: record.scope,
      path: record.path ?? mutationPath.root(),
      value: record.value
    })
  }
}

export const emitEdgeMovePatchOps = (
  edge: Edge,
  patch: EdgePatch,
  ctx: WhiteboardIntentContext
) => {
  const records: import('@whiteboard/core/types').EdgeRecordMutation[] = []
  const input: EdgeUpdateInput = {
    fields: {},
    records
  }

  if (patch.source) {
    input.fields!.source = patch.source
  }
  if (patch.target) {
    input.fields!.target = patch.target
  }
  if (patch.type) {
    input.fields!.type = patch.type
  }
  if (hasOwn(patch, 'locked')) {
    input.fields!.locked = patch.locked
  }
  if (hasOwn(patch, 'groupId')) {
    input.fields!.groupId = patch.groupId
  }
  if (hasOwn(patch, 'textMode')) {
    input.fields!.textMode = patch.textMode
  }
  if (hasOwn(patch, 'data')) {
    diffRecordTrees({
      current: edge.data,
      next: patch.data,
      emitSet: (path, value) => {
        records.push({
          scope: 'data',
          op: 'set',
          path,
          value
        })
      },
      emitUnset: (path) => {
        records.push({
          scope: 'data',
          op: 'unset',
          path
        })
      }
    })
  }
  if (hasOwn(patch, 'style')) {
    diffRecordTrees({
      current: edge.style,
      next: patch.style,
      emitSet: (path, value) => {
        records.push({
          scope: 'style',
          op: 'set',
          path,
          value
        })
      },
      emitUnset: (path) => {
        records.push({
          scope: 'style',
          op: 'unset',
          path
        })
      }
    })
  }

  if (input.fields && Object.keys(input.fields).length > 0 || (input.records?.length ?? 0) > 0) {
    emitEdgeUpdateInputOps(edge, {
      fields: Object.keys(input.fields ?? {}).length > 0 ? input.fields : undefined,
      records: input.records && input.records.length > 0 ? input.records : undefined
    }, ctx)
  }

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
  ctx: WhiteboardIntentContext
) => {
  const point = edge.route?.kind === 'manual'
    ? edge.route.points.find((entry) => entry.id === pointId)
    : undefined
  if (!point) {
    return ctx.tx.fail.invalid(`Edge ${edge.id} route point not found.`)
  }

  ctx.tx.emit({
    type: 'edge.route.point.delete',
    edgeId: edge.id,
    pointId
  })
}

export const compileEdgeIntent = (
  intent: EdgeIntent,
  ctx: WhiteboardIntentContext
) => {
  const document = ctx.tx.read.document.get()

  switch (intent.type) {
    case 'edge.create': {
      const built = edgeApi.op.create({
        payload: intent.input,
        doc: document,
        registries: ctx.registries,
        createEdgeId: ctx.tx.ids.edge,
        createEdgeRoutePointId: ctx.tx.ids.edgeRoutePoint
      })
      if (!built.ok) {
        return ctx.tx.fail.invalid(built.error.message, built.error.details)
      }

      ctx.tx.emit(built.data.operation)
      return {
        edgeId: built.data.edgeId
      }
    }
    case 'edge.update': {
      const decision = resolveLockDecision({
        document,
        target: {
          kind: 'edge-ids',
          edgeIds: intent.updates.map((entry) => entry.id)
        }
      })
      if (!decision.allowed) {
        return ctx.tx.fail.cancelled(
          decision.reason === 'locked-node'
            ? 'Locked nodes cannot be modified.'
            : decision.reason === 'locked-edge'
              ? 'Locked edges cannot be modified.'
              : 'Locked node relations cannot be modified.'
        )
      }

      intent.updates.forEach((entry) => {
        const edge = ctx.tx.read.edge.get(entry.id)
        if (!edge) {
          return
        }
        emitEdgeUpdateInputOps(edge, entry.input, ctx)
      })
      return
    }
    case 'edge.move': {
      const decision = resolveLockDecision({
        document,
        target: {
          kind: 'edge-ids',
          edgeIds: intent.ids
        }
      })
      if (!decision.allowed) {
        return ctx.tx.fail.cancelled(
          decision.reason === 'locked-node'
            ? 'Locked nodes cannot be modified.'
            : decision.reason === 'locked-edge'
              ? 'Locked edges cannot be modified.'
              : 'Locked node relations cannot be modified.'
        )
      }

      intent.ids.forEach((edgeId) => {
        const edge = ctx.tx.read.edge.get(edgeId)
        const patch = edge ? edgeApi.edit.move(edge, intent.delta) : undefined
        if (!edge || !patch) {
          return
        }
        emitEdgeMovePatchOps(edge, patch, ctx)
      })
      return
    }
    case 'edge.reconnect.commit': {
      const currentDecision = resolveLockDecision({
        document,
        target: {
          kind: 'edge-ids',
          edgeIds: [intent.edgeId]
        }
      })
      if (!currentDecision.allowed) {
        return ctx.tx.fail.cancelled(
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
        return ctx.tx.fail.cancelled(
          targetDecision.reason === 'locked-node'
            ? 'Locked nodes cannot be modified.'
            : targetDecision.reason === 'locked-edge'
              ? 'Locked edges cannot be modified.'
              : 'Locked node relations cannot be modified.'
        )
      }

      const edge = ctx.tx.read.edge.get(intent.edgeId)
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
      return
    }
    case 'edge.delete': {
      const decision = resolveLockDecision({
        document,
        target: {
          kind: 'edge-ids',
          edgeIds: intent.ids
        }
      })
      if (!decision.allowed) {
        return ctx.tx.fail.cancelled(
          decision.reason === 'locked-node'
            ? 'Locked nodes cannot be modified.'
            : decision.reason === 'locked-edge'
              ? 'Locked edges cannot be modified.'
              : 'Locked node relations cannot be modified.'
        )
      }

      intent.ids.forEach((id) => {
        ctx.tx.emit({
          type: 'edge.delete',
          id
        })
      })
      return
    }
    case 'edge.label.insert': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      const labelId = ctx.tx.ids.edgeLabel()
      ctx.tx.emit({
        type: 'edge.label.insert',
        edgeId: edge.id,
        label: {
          id: labelId,
          ...intent.label
        } as EdgeLabel,
        to: intent.to ?? { kind: 'end' }
      })
      return {
        labelId
      }
    }
    case 'edge.label.update': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      const label = edge.labels?.find((entry) => entry.id === intent.labelId)
      if (!label) {
        return ctx.tx.fail.invalid(`Edge label ${intent.labelId} not found.`)
      }

      const fields = intent.input.fields
      if (fields && hasOwn(fields, 'text')) {
        if (fields.text === undefined) {
          ctx.tx.emit({
            type: 'edge.label.field.unset',
            edgeId: edge.id,
            labelId: label.id,
            field: 'text'
          })
        } else if (label.text !== fields.text) {
          ctx.tx.emit({
            type: 'edge.label.field.set',
            edgeId: edge.id,
            labelId: label.id,
            field: 'text',
            value: fields.text
          })
        }
      }
      if (fields && hasOwn(fields, 't') && label.t !== fields.t) {
        if (fields.t === undefined) {
          ctx.tx.emit({
            type: 'edge.label.field.unset',
            edgeId: edge.id,
            labelId: label.id,
            field: 't'
          })
        } else {
          ctx.tx.emit({
            type: 'edge.label.field.set',
            edgeId: edge.id,
            labelId: label.id,
            field: 't',
            value: fields.t
          })
        }
      }
      if (fields && hasOwn(fields, 'offset') && label.offset !== fields.offset) {
        if (fields.offset === undefined) {
          ctx.tx.emit({
            type: 'edge.label.field.unset',
            edgeId: edge.id,
            labelId: label.id,
            field: 'offset'
          })
        } else {
          ctx.tx.emit({
            type: 'edge.label.field.set',
            edgeId: edge.id,
            labelId: label.id,
            field: 'offset',
            value: fields.offset
          })
        }
      }

      for (const record of intent.input.records ?? []) {
        if (record.op === 'unset') {
          ctx.tx.emit({
            type: 'edge.label.record.unset',
            edgeId: edge.id,
            labelId: label.id,
            scope: record.scope,
            path: record.path
          })
          continue
        }

        ctx.tx.emit({
          type: 'edge.label.record.set',
          edgeId: edge.id,
          labelId: label.id,
          scope: record.scope,
          path: record.path ?? mutationPath.root(),
          value: record.value
        })
      }
      return
    }
    case 'edge.label.move':
      ctx.tx.emit({
        type: 'edge.label.move',
        edgeId: intent.edgeId,
        labelId: intent.labelId,
        to: intent.to
      })
      return
    case 'edge.label.delete':
      ctx.tx.emit({
        type: 'edge.label.delete',
        edgeId: intent.edgeId,
        labelId: intent.labelId
      })
      return
    case 'edge.route.insert': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      const pointId = ctx.tx.ids.edgeRoutePoint()
      ctx.tx.emit({
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
    }
    case 'edge.route.update': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      const point = edge.route?.kind === 'manual'
        ? edge.route.points.find((entry) => entry.id === intent.pointId)
        : undefined
      if (!point) {
        return ctx.tx.fail.invalid(`Edge ${edge.id} route point not found.`)
      }

      if (intent.fields.x !== undefined && point.x !== intent.fields.x) {
        ctx.tx.emit({
          type: 'edge.route.point.field.set',
          edgeId: edge.id,
          pointId: point.id,
          field: 'x',
          value: intent.fields.x
        })
      }
      if (intent.fields.y !== undefined && point.y !== intent.fields.y) {
        ctx.tx.emit({
          type: 'edge.route.point.field.set',
          edgeId: edge.id,
          pointId: point.id,
          field: 'y',
          value: intent.fields.y
        })
      }
      return
    }
    case 'edge.route.set': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      emitEdgeRouteDiffOps(
        edge.id,
        edge.route?.kind === 'manual' ? edge.route.points : [],
        intent.route.kind === 'manual' ? intent.route.points : [],
        ctx
      )
      return
    }
    case 'edge.route.move':
      ctx.tx.emit({
        type: 'edge.route.point.move',
        edgeId: intent.edgeId,
        pointId: intent.pointId,
        to: intent.to
      })
      return
    case 'edge.route.delete': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      return compileEdgeRouteDelete(edge, intent.pointId, ctx)
    }
    case 'edge.route.clear': {
      const edge = ctx.tx.read.edge.require(intent.edgeId)
      if (!edge) {
        return
      }
      if (edge.route?.kind !== 'manual') {
        return
      }
      edge.route.points.forEach((point) => {
        ctx.tx.emit({
          type: 'edge.route.point.delete',
          edgeId: edge.id,
          pointId: point.id
        })
      })
      return
    }
  }
}

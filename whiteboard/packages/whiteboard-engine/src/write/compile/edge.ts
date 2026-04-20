import {
  buildEdgeCreateOperation,
  moveEdge,
  sameEdgeEnd
} from '@whiteboard/core/edge'
import { resolveLockDecision } from '@whiteboard/core/lock'
import { isValueEqual } from '@whiteboard/core/value'
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
import type { EdgeCommand } from '@whiteboard/engine/types/command'
import type { CommandCompileContext } from '@whiteboard/engine/write/types'

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
  path: string,
  value: unknown,
  emitSet: (path: string, value: unknown) => void
) => {
  if (isRecordTree(value) && Object.keys(value).length > 0) {
    Object.entries(value).forEach(([key, entry]) => {
      appendRecordSetPaths(
        path ? `${path}.${key}` : key,
        entry,
        emitSet
      )
    })
    return
  }

  if (!path) {
    return
  }
  emitSet(path, value)
}

const appendRecordUnsetPaths = (
  path: string,
  value: unknown,
  emitUnset: (path: string) => void
) => {
  if (isRecordTree(value) && Object.keys(value).length > 0) {
    Object.entries(value).forEach(([key, entry]) => {
      appendRecordUnsetPaths(
        path ? `${path}.${key}` : key,
        entry,
        emitUnset
      )
    })
    return
  }

  if (!path) {
    return
  }
  emitUnset(path)
}

const diffRecordTrees = ({
  current,
  next,
  emitSet,
  emitUnset,
  path = ''
}: {
  current: unknown
  next: unknown
  emitSet: (path: string, value: unknown) => void
  emitUnset: (path: string) => void
  path?: string
}) => {
  if (isValueEqual(current, next)) {
    return
  }

  if (isRecordTree(current) && isRecordTree(next)) {
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(next)
    ])

    keys.forEach((key) => {
      const childPath = path ? `${path}.${key}` : key
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

  if (!path) {
    appendRecordSetPaths(path, next, emitSet)
    return
  }

  emitSet(path, next)
}

const emitEdgeRouteDiffOps = (
  edgeId: EdgeId,
  currentPoints: readonly EdgeRoutePoint[],
  nextPoints: readonly Point[],
  ctx: CommandCompileContext
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
  ctx: CommandCompileContext
) => {
  const fields = input.fields

  if (fields?.source && !sameEdgeEnd(edge.source, fields.source)) {
    ctx.tx.emit({
      type: 'edge.field.set',
      id: edge.id,
      field: 'source',
      value: fields.source
    })
  }
  if (fields?.target && !sameEdgeEnd(edge.target, fields.target)) {
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
      path: record.path ?? '',
      value: record.value
    })
  }
}

export const emitEdgeMovePatchOps = (
  edge: Edge,
  patch: EdgePatch,
  ctx: CommandCompileContext
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
  ctx: CommandCompileContext
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

export const compileEdgeCommand = (
  command: EdgeCommand,
  ctx: CommandCompileContext
) => {
  const document = ctx.tx.read.document.get()

  switch (command.type) {
    case 'edge.create': {
      const built = buildEdgeCreateOperation({
        payload: command.input,
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
          edgeIds: command.updates.map((entry) => entry.id)
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

      command.updates.forEach((entry) => {
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
          edgeIds: command.ids
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

      command.ids.forEach((edgeId) => {
        const edge = ctx.tx.read.edge.get(edgeId)
        const patch = edge ? moveEdge(edge, command.delta) : undefined
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
          edgeIds: [command.edgeId]
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
          ends: [command.target]
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

      const edge = ctx.tx.read.edge.get(command.edgeId)
      if (!edge) {
        return
      }

      emitEdgeMovePatchOps(edge, {
        ...(command.end === 'source'
          ? { source: command.target }
          : { target: command.target }),
        ...(command.patch?.type
          ? {
              type: command.patch.type
            }
          : {}),
        ...(command.patch?.route
          ? {
              route: command.patch.route
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
          edgeIds: command.ids
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

      command.ids.forEach((id) => {
        ctx.tx.emit({
          type: 'edge.delete',
          id
        })
      })
      return
    }
    case 'edge.label.insert': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
      const labelId = ctx.tx.ids.edgeLabel()
      ctx.tx.emit({
        type: 'edge.label.insert',
        edgeId: edge.id,
        label: {
          id: labelId,
          ...command.label
        } as EdgeLabel,
        to: command.to ?? { kind: 'end' }
      })
      return {
        labelId
      }
    }
    case 'edge.label.update': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
      const label = edge.labels?.find((entry) => entry.id === command.labelId)
      if (!label) {
        return ctx.tx.fail.invalid(`Edge label ${command.labelId} not found.`)
      }

      const fields = command.input.fields
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

      for (const record of command.input.records ?? []) {
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
          path: record.path ?? '',
          value: record.value
        })
      }
      return
    }
    case 'edge.label.move':
      ctx.tx.emit({
        type: 'edge.label.move',
        edgeId: command.edgeId,
        labelId: command.labelId,
        to: command.to
      })
      return
    case 'edge.label.delete':
      ctx.tx.emit({
        type: 'edge.label.delete',
        edgeId: command.edgeId,
        labelId: command.labelId
      })
      return
    case 'edge.route.insert': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
      const pointId = ctx.tx.ids.edgeRoutePoint()
      ctx.tx.emit({
        type: 'edge.route.point.insert',
        edgeId: edge.id,
        point: {
          id: pointId,
          x: command.point.x,
          y: command.point.y
        },
        to: command.to ?? { kind: 'end' }
      })
      return {
        pointId
      }
    }
    case 'edge.route.update': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
      const point = edge.route?.kind === 'manual'
        ? edge.route.points.find((entry) => entry.id === command.pointId)
        : undefined
      if (!point) {
        return ctx.tx.fail.invalid(`Edge ${edge.id} route point not found.`)
      }

      if (command.fields.x !== undefined && point.x !== command.fields.x) {
        ctx.tx.emit({
          type: 'edge.route.point.field.set',
          edgeId: edge.id,
          pointId: point.id,
          field: 'x',
          value: command.fields.x
        })
      }
      if (command.fields.y !== undefined && point.y !== command.fields.y) {
        ctx.tx.emit({
          type: 'edge.route.point.field.set',
          edgeId: edge.id,
          pointId: point.id,
          field: 'y',
          value: command.fields.y
        })
      }
      return
    }
    case 'edge.route.set': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
      emitEdgeRouteDiffOps(
        edge.id,
        edge.route?.kind === 'manual' ? edge.route.points : [],
        command.route.kind === 'manual' ? command.route.points : [],
        ctx
      )
      return
    }
    case 'edge.route.move':
      ctx.tx.emit({
        type: 'edge.route.point.move',
        edgeId: command.edgeId,
        pointId: command.pointId,
        to: command.to
      })
      return
    case 'edge.route.delete': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
      return compileEdgeRouteDelete(edge, command.pointId, ctx)
    }
    case 'edge.route.clear': {
      const edge = ctx.tx.read.edge.require(command.edgeId)
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

import { err } from '@whiteboard/core/result'
import type {
  EdgeLabel,
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'
import {
  applyEdgeFieldSet,
  applyEdgeFieldUnset,
  applyEdgeRecordOperation,
  readRecordPathValue
} from '@whiteboard/core/kernel/reduce/apply'
import {
  cloneCanvasSlot,
  cloneEdge
} from '@whiteboard/core/kernel/reduce/clone'
import {
  deleteEdge,
  getEdge,
  insertCanvasSlot,
  readCanvasOrder,
  readCanvasSlot,
  setEdge,
  writeCanvasOrder
} from '@whiteboard/core/kernel/reduce/draft'
import { markChange } from '@whiteboard/core/kernel/reduce/state'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'
import { applyPathMutation } from '@whiteboard/core/utils/recordMutation'
import { cloneValue } from '@whiteboard/core/value'

type EdgeOperation = Extract<
  Operation,
  {
    type:
      | 'edge.create'
      | 'edge.restore'
      | 'edge.field.set'
      | 'edge.field.unset'
      | 'edge.record.set'
      | 'edge.record.unset'
      | 'edge.label.insert'
      | 'edge.label.delete'
      | 'edge.label.move'
      | 'edge.label.field.set'
      | 'edge.label.field.unset'
      | 'edge.label.record.set'
      | 'edge.label.record.unset'
      | 'edge.route.point.insert'
      | 'edge.route.point.delete'
      | 'edge.route.point.move'
      | 'edge.route.point.field.set'
      | 'edge.delete'
  }
>

export const handleEdgeOperation = (
  runtime: ReduceRuntime,
  operation: EdgeOperation
): KernelReduceResult | undefined => {
  switch (operation.type) {
    case 'edge.create': {
      setEdge(runtime.draft, operation.edge)
      runtime.inverse.unshift({
        type: 'edge.delete',
        id: operation.edge.id
      })
      markChange(runtime.changes.edges, 'add', operation.edge.id)
      runtime.changes.canvasOrder = true
      return
    }
    case 'edge.restore': {
      runtime.draft.edges.set(operation.edge.id, operation.edge)
      writeCanvasOrder(runtime.draft, insertCanvasSlot(readCanvasOrder(runtime.draft), {
        kind: 'edge',
        id: operation.edge.id
      }, operation.slot))
      runtime.inverse.unshift({
        type: 'edge.delete',
        id: operation.edge.id
      })
      markChange(runtime.changes.edges, 'add', operation.edge.id)
      runtime.changes.canvasOrder = true
      return
    }
    case 'edge.field.set': {
      const current = getEdge(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Edge ${operation.id} not found.`)
      }
      runtime.inverse.unshift(
        ((current as unknown as Record<string, unknown>)[operation.field] === undefined) && operation.field !== 'source' && operation.field !== 'target' && operation.field !== 'type'
          ? {
              type: 'edge.field.unset',
              id: operation.id,
              field: operation.field as Extract<Operation, { type: 'edge.field.unset' }>['field']
            }
          : {
              type: 'edge.field.set',
              id: operation.id,
              field: operation.field,
              value: cloneValue((current as unknown as Record<string, unknown>)[operation.field])
            }
      )
      runtime.draft.edges.set(operation.id, applyEdgeFieldSet(current, operation))
      markChange(runtime.changes.edges, 'update', operation.id)
      return
    }
    case 'edge.field.unset': {
      const current = getEdge(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Edge ${operation.id} not found.`)
      }
      runtime.inverse.unshift({
        type: 'edge.field.set',
        id: operation.id,
        field: operation.field,
        value: cloneValue((current as unknown as Record<string, unknown>)[operation.field])
      })
      runtime.draft.edges.set(operation.id, applyEdgeFieldUnset(current, operation))
      markChange(runtime.changes.edges, 'update', operation.id)
      return
    }
    case 'edge.record.set':
    case 'edge.record.unset': {
      const current = getEdge(runtime.draft, operation.id)
      if (!current) {
        return err('invalid', `Edge ${operation.id} not found.`)
      }
      const currentRoot = operation.scope === 'data'
        ? current.data
        : current.style
      if (operation.type === 'edge.record.set') {
        const previous = readRecordPathValue(currentRoot, operation.path)
        runtime.inverse.unshift(previous === undefined
          ? {
              type: 'edge.record.unset',
              id: operation.id,
              scope: operation.scope,
              path: operation.path
            }
          : {
              type: 'edge.record.set',
              id: operation.id,
              scope: operation.scope,
              path: operation.path,
              value: cloneValue(previous)
            })
      } else {
        runtime.inverse.unshift({
          type: 'edge.record.set',
          id: operation.id,
          scope: operation.scope,
          path: operation.path,
          value: cloneValue(readRecordPathValue(currentRoot, operation.path))
        })
      }
      const next = applyEdgeRecordOperation(current, operation)
      if (!next.ok) {
        return err('invalid', next.message)
      }
      runtime.draft.edges.set(operation.id, next.edge)
      markChange(runtime.changes.edges, 'update', operation.id)
      return
    }
    case 'edge.label.insert': {
      const current = getEdge(runtime.draft, operation.edgeId)
      if (!current) {
        return err('invalid', `Edge ${operation.edgeId} not found.`)
      }
      const labels = [...(current.labels ?? []).filter((label) => label.id !== operation.label.id)]
      const insertAt = operation.to.kind === 'start'
        ? 0
        : operation.to.kind === 'end'
          ? labels.length
          : (() => {
              const anchorIndex = labels.findIndex((label) => (
                operation.to.kind === 'before' || operation.to.kind === 'after'
                  ? label.id === operation.to.labelId
                  : false
              ))
              if (anchorIndex < 0) {
                return operation.to.kind === 'before' ? 0 : labels.length
              }
              return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      labels.splice(insertAt, 0, operation.label)
      runtime.inverse.unshift({
        type: 'edge.label.delete',
        edgeId: operation.edgeId,
        labelId: operation.label.id
      })
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        labels
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.label.delete': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const labels = current?.labels ?? []
      const index = labels.findIndex((label) => label.id === operation.labelId)
      if (!current || index < 0) {
        return
      }
      const label = labels[index]!
      runtime.inverse.unshift({
        type: 'edge.label.insert',
        edgeId: operation.edgeId,
        label: cloneValue(label),
        to: index === 0
          ? { kind: 'start' }
          : {
              kind: 'after',
              labelId: labels[index - 1]!.id
            }
      })
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        labels: labels.filter((entry) => entry.id !== operation.labelId)
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.label.move': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = labels.findIndex((label) => label.id === operation.labelId)
      if (!current || index < 0) {
        return
      }
      const label = labels[index]!
      const inverseTo: Extract<Operation, { type: 'edge.label.move' }>['to'] = index === 0
        ? { kind: 'start' }
        : {
            kind: 'after',
            labelId: labels[index - 1]!.id
          }
      labels.splice(index, 1)
      const insertAt = operation.to.kind === 'start'
        ? 0
        : operation.to.kind === 'end'
          ? labels.length
          : (() => {
              const anchorIndex = labels.findIndex((entry) => (
                operation.to.kind === 'before' || operation.to.kind === 'after'
                  ? entry.id === operation.to.labelId
                  : false
              ))
              if (anchorIndex < 0) {
                return operation.to.kind === 'before' ? 0 : labels.length
              }
              return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      labels.splice(insertAt, 0, label)
      runtime.inverse.unshift({
        type: 'edge.label.move',
        edgeId: operation.edgeId,
        labelId: operation.labelId,
        to: inverseTo
      })
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        labels
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.label.field.set': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = labels.findIndex((label) => label.id === operation.labelId)
      if (!current || index < 0) {
        return err('invalid', `Edge label ${operation.labelId} not found.`)
      }
      const label = labels[index]!
      const previous = (label as Record<string, unknown>)[operation.field]
      runtime.inverse.unshift(previous === undefined
        ? {
            type: 'edge.label.field.unset',
            edgeId: operation.edgeId,
            labelId: operation.labelId,
            field: operation.field
          }
        : {
            type: 'edge.label.field.set',
            edgeId: operation.edgeId,
            labelId: operation.labelId,
            field: operation.field,
            value: cloneValue(previous)
          })
      labels[index] = {
        ...label,
        [operation.field]: cloneValue(operation.value) as never
      }
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        labels
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.label.field.unset': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = labels.findIndex((label) => label.id === operation.labelId)
      if (!current || index < 0) {
        return err('invalid', `Edge label ${operation.labelId} not found.`)
      }
      const label = labels[index]!
      runtime.inverse.unshift({
        type: 'edge.label.field.set',
        edgeId: operation.edgeId,
        labelId: operation.labelId,
        field: operation.field,
        value: cloneValue((label as Record<string, unknown>)[operation.field])
      })
      const nextLabel = { ...label } as EdgeLabel & Record<string, unknown>
      delete nextLabel[operation.field]
      labels[index] = nextLabel
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        labels
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.label.record.set':
    case 'edge.label.record.unset': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = labels.findIndex((label) => label.id === operation.labelId)
      if (!current || index < 0) {
        return err('invalid', `Edge label ${operation.labelId} not found.`)
      }
      const label = labels[index]!
      const currentRoot = operation.scope === 'data'
        ? label.data
        : label.style
      const previous = readRecordPathValue(currentRoot, operation.path)
      runtime.inverse.unshift(operation.type === 'edge.label.record.set' && previous === undefined
        ? {
            type: 'edge.label.record.unset',
            edgeId: operation.edgeId,
            labelId: operation.labelId,
            scope: operation.scope,
            path: operation.path
          }
        : {
            type: 'edge.label.record.set',
            edgeId: operation.edgeId,
            labelId: operation.labelId,
            scope: operation.scope,
            path: operation.path,
            value: cloneValue(previous)
          })
      const result = applyPathMutation(currentRoot, operation.type === 'edge.label.record.set'
        ? {
            op: 'set',
            path: operation.path,
            value: operation.value
          }
        : {
            op: 'unset',
            path: operation.path
          })
      if (!result.ok) {
        return err('invalid', result.message)
      }
      labels[index] = {
        ...label,
        ...(operation.scope === 'data'
          ? { data: result.value as NonNullable<typeof label.data> }
          : { style: result.value as NonNullable<typeof label.style> })
      }
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        labels
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.route.point.insert': {
      const current = getEdge(runtime.draft, operation.edgeId)
      if (!current) {
        return err('invalid', `Edge ${operation.edgeId} not found.`)
      }
      const points = current.route?.kind === 'manual'
        ? [...current.route.points]
        : []
      const insertAt = operation.to.kind === 'start'
        ? 0
        : operation.to.kind === 'end'
          ? points.length
          : (() => {
              const anchorIndex = points.findIndex((point) => (
                operation.to.kind === 'before' || operation.to.kind === 'after'
                  ? point.id === operation.to.pointId
                  : false
              ))
              if (anchorIndex < 0) {
                return operation.to.kind === 'before' ? 0 : points.length
              }
              return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      points.splice(insertAt, 0, operation.point)
      runtime.inverse.unshift({
        type: 'edge.route.point.delete',
        edgeId: operation.edgeId,
        pointId: operation.point.id
      })
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        route: points.length > 0
          ? {
              kind: 'manual',
              points
            }
          : {
              kind: 'auto'
            }
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.route.point.delete': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const points = current?.route?.kind === 'manual'
        ? [...current.route.points]
        : []
      const index = points.findIndex((point) => point.id === operation.pointId)
      if (!current || index < 0) {
        return
      }
      const point = points[index]!
      runtime.inverse.unshift({
        type: 'edge.route.point.insert',
        edgeId: operation.edgeId,
        point: cloneValue(point),
        to: index === 0
          ? { kind: 'start' }
          : {
              kind: 'after',
              pointId: points[index - 1]!.id
            }
      })
      const nextPoints = points.filter((entry) => entry.id !== operation.pointId)
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        route: nextPoints.length > 0
          ? {
              kind: 'manual',
              points: nextPoints
            }
          : {
              kind: 'auto'
            }
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.route.point.move': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const points = current?.route?.kind === 'manual'
        ? [...current.route.points]
        : []
      const index = points.findIndex((point) => point.id === operation.pointId)
      if (!current || index < 0) {
        return
      }
      const point = points[index]!
      const inverseTo: Extract<Operation, { type: 'edge.route.point.move' }>['to'] = index === 0
        ? { kind: 'start' }
        : {
            kind: 'after',
            pointId: points[index - 1]!.id
          }
      points.splice(index, 1)
      const insertAt = operation.to.kind === 'start'
        ? 0
        : operation.to.kind === 'end'
          ? points.length
          : (() => {
              const anchorIndex = points.findIndex((entry) => (
                operation.to.kind === 'before' || operation.to.kind === 'after'
                  ? entry.id === operation.to.pointId
                  : false
              ))
              if (anchorIndex < 0) {
                return operation.to.kind === 'before' ? 0 : points.length
              }
              return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      points.splice(insertAt, 0, point)
      runtime.inverse.unshift({
        type: 'edge.route.point.move',
        edgeId: operation.edgeId,
        pointId: operation.pointId,
        to: inverseTo
      })
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        route: {
          kind: 'manual',
          points
        }
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.route.point.field.set': {
      const current = getEdge(runtime.draft, operation.edgeId)
      const points = current?.route?.kind === 'manual'
        ? [...current.route.points]
        : []
      const index = points.findIndex((point) => point.id === operation.pointId)
      if (!current || index < 0) {
        return err('invalid', `Edge route point ${operation.pointId} not found.`)
      }
      const point = points[index]!
      runtime.inverse.unshift({
        type: 'edge.route.point.field.set',
        edgeId: operation.edgeId,
        pointId: operation.pointId,
        field: operation.field,
        value: point[operation.field]
      })
      points[index] = {
        ...point,
        [operation.field]: operation.value
      }
      runtime.draft.edges.set(operation.edgeId, {
        ...current,
        route: {
          kind: 'manual',
          points
        }
      })
      markChange(runtime.changes.edges, 'update', operation.edgeId)
      return
    }
    case 'edge.delete': {
      const current = getEdge(runtime.draft, operation.id)
      if (!current) {
        return
      }
      runtime.inverse.unshift({
        type: 'edge.restore',
        edge: cloneEdge(current),
        slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(runtime.draft), {
          kind: 'edge',
          id: current.id
        }))
      })
      deleteEdge(runtime.draft, operation.id)
      markChange(runtime.changes.edges, 'delete', operation.id)
      runtime.changes.canvasOrder = true
      return
    }
  }
}

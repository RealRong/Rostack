import { json } from '@shared/core'
import { applyRecordPathMutation, readRecordPath } from '../../mutation/recordPath'
import type { Path } from '@shared/mutation'
import type {
  Edge,
  EdgeField,
  EdgeId,
  EdgeLabel,
  EdgeLabelField,
  EdgeLabelRecordScope,
  EdgeRoutePoint,
  EdgeRoutePointField,
  EdgeRecordScope,
  EdgeUnsetField
} from '@whiteboard/core/types'
import {
  captureEdge,
  getEdge,
  markCanvasOrderTouched,
  markEdgeAdded,
  markEdgeRemoved,
  markEdgeUpdated,
  type WhiteboardReduceState
} from './state'
import {
  appendCanvasRef,
  captureCanvasSlot,
  insertCanvasSlot,
  removeCanvasRef
} from './canvas'
import type { OrderedAnchor } from './ordered'

const setEdgeField = <Field extends EdgeField>(
  edge: Edge,
  field: Field,
  value: Edge[Field]
): Edge => ({
  ...edge,
  [field]: value
})

const unsetEdgeField = (
  edge: Edge,
  field: EdgeUnsetField
): Edge => {
  const next = { ...edge } as Edge & Record<string, unknown>
  delete next[field]
  return next
}

const applyEdgeRecordMutation = (
  edge: Edge,
  scope: EdgeRecordScope,
  mutation: { op: 'set'; path: Path; value: unknown } | { op: 'unset'; path: Path }
) => {
  const current = scope === 'data'
    ? edge.data
    : edge.style
  const result = applyRecordPathMutation(current, mutation)
  if (!result.ok) {
    return result
  }

  return {
    ok: true as const,
    edge: {
      ...edge,
      ...(scope === 'data'
        ? { data: result.value as Edge['data'] }
        : { style: result.value as Edge['style'] })
    }
  }
}

const getLabels = (
  edge: Edge
): readonly EdgeLabel[] => edge.labels ?? []

const getManualRoutePoints = (
  edge: Edge
): readonly EdgeRoutePoint[] => (
  edge.route?.kind === 'manual'
    ? edge.route.points
    : []
)

export const createEdge = (
  state: WhiteboardReduceState,
  edge: Edge
): void => {
  state.draft.edges.set(edge.id, edge)
  state.draft.canvasOrder.set(appendCanvasRef(state.draft.canvasOrder.current(), {
    kind: 'edge',
    id: edge.id
  }))
  state.inverse.prepend({
    type: 'edge.delete',
    id: edge.id
  })
  markEdgeAdded(state, edge.id)
  markCanvasOrderTouched(state)
}

export const restoreEdge = (
  state: WhiteboardReduceState,
  edge: Edge,
  slot?: import('@whiteboard/core/types').CanvasSlot
): void => {
  state.draft.edges.set(edge.id, edge)
  state.draft.canvasOrder.set(insertCanvasSlot(state.draft.canvasOrder.current(), {
    kind: 'edge',
    id: edge.id
  }, slot))
  state.inverse.prepend({
    type: 'edge.delete',
    id: edge.id
  })
  markEdgeAdded(state, edge.id)
  markCanvasOrderTouched(state)
}

export const deleteEdge = (
  state: WhiteboardReduceState,
  id: EdgeId
): void => {
  const current = getEdge(state.draft, id)
  if (!current) {
    return
  }

  state.inverse.prepend({
    type: 'edge.restore',
    edge: captureEdge(state, id),
    slot: captureCanvasSlot(state, {
      kind: 'edge',
      id
    })
  })
  state.draft.edges.delete(id)
  state.draft.canvasOrder.set(removeCanvasRef(state.draft.canvasOrder.current(), {
    kind: 'edge',
    id
  }))
  markEdgeRemoved(state, id)
  markCanvasOrderTouched(state)
}

export const setEdgeFieldValue = <Field extends EdgeField>(
  state: WhiteboardReduceState,
  id: EdgeId,
  field: Field,
  value: Edge[Field]
): void => {
  const current = getEdge(state.draft, id)
  if (!current) {
    throw new Error(`Edge ${id} not found.`)
  }

  const previous = current[field]
  state.inverse.prepend(
    previous === undefined
      && field !== 'source'
      && field !== 'target'
      && field !== 'type'
      ? {
          type: 'edge.field.unset',
          id,
          field: field as EdgeUnsetField
        }
      : {
          type: 'edge.field.set',
          id,
          field,
          value: json.clone(previous)
        }
  )
  state.draft.edges.set(id, setEdgeField(current, field, value))
  markEdgeUpdated(state, id)
}

export const unsetEdgeFieldValue = (
  state: WhiteboardReduceState,
  id: EdgeId,
  field: EdgeUnsetField
): void => {
  const current = getEdge(state.draft, id)
  if (!current) {
    throw new Error(`Edge ${id} not found.`)
  }

  state.inverse.prepend({
    type: 'edge.field.set',
    id,
    field,
    value: json.clone(current[field])
  })
  state.draft.edges.set(id, unsetEdgeField(current, field))
  markEdgeUpdated(state, id)
}

export const setEdgeRecord = (
  state: WhiteboardReduceState,
  id: EdgeId,
  scope: EdgeRecordScope,
  path: Path,
  value: unknown
): void => {
  const current = getEdge(state.draft, id)
  if (!current) {
    throw new Error(`Edge ${id} not found.`)
  }

  const currentRoot = scope === 'data'
    ? current.data
    : current.style
  const previous = readRecordPath(currentRoot, path)
  state.inverse.prepend(previous === undefined
    ? {
        type: 'edge.record.unset',
        id,
        scope,
        path
      }
    : {
        type: 'edge.record.set',
        id,
        scope,
        path,
        value: json.clone(previous)
      })
  const next = applyEdgeRecordMutation(current, scope, {
    op: 'set',
    path,
    value
  })
  if (!next.ok) {
    throw new Error(next.message)
  }

  state.draft.edges.set(id, next.edge)
  markEdgeUpdated(state, id)
}

export const unsetEdgeRecord = (
  state: WhiteboardReduceState,
  id: EdgeId,
  scope: EdgeRecordScope,
  path: Path
): void => {
  const current = getEdge(state.draft, id)
  if (!current) {
    throw new Error(`Edge ${id} not found.`)
  }

  const currentRoot = scope === 'data'
    ? current.data
    : current.style
  state.inverse.prepend({
    type: 'edge.record.set',
    id,
    scope,
    path,
    value: json.clone(readRecordPath(currentRoot, path))
  })
  const next = applyEdgeRecordMutation(current, scope, {
    op: 'unset',
    path
  })
  if (!next.ok) {
    throw new Error(next.message)
  }

  state.draft.edges.set(id, next.edge)
  markEdgeUpdated(state, id)
}

export const insertEdgeLabel = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  label: EdgeLabel,
  to: OrderedAnchor
): void => {
  const current = getEdge(state.draft, edgeId)
  if (!current) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  const labels = [...getLabels(current).filter((entry) => entry.id !== label.id)]
  const insertAt = to.kind === 'start'
    ? 0
    : to.kind === 'end'
      ? labels.length
      : (() => {
          const anchorIndex = labels.findIndex((entry) => entry.id === to.itemId)
          if (anchorIndex < 0) {
            return to.kind === 'before'
              ? 0
              : labels.length
          }
          return to.kind === 'before'
            ? anchorIndex
            : anchorIndex + 1
        })()
  labels.splice(insertAt, 0, label)
  state.inverse.prepend({
    type: 'edge.label.delete',
    edgeId,
    labelId: label.id
  })
  state.draft.edges.set(edgeId, {
    ...current,
    labels
  })
  markEdgeUpdated(state, edgeId)
}

export const deleteEdgeLabel = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string
): void => {
  const current = getEdge(state.draft, edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === labelId)
  if (!current || index < 0) {
    return
  }

  const label = labels[index]!
  state.inverse.prepend({
    type: 'edge.label.insert',
    edgeId,
    label: json.clone(label),
    to: index === 0
      ? { kind: 'start' }
      : { kind: 'after', labelId: labels[index - 1]!.id }
  })
  state.draft.edges.set(edgeId, {
    ...current,
    labels: labels.filter((entry) => entry.id !== labelId)
  })
  markEdgeUpdated(state, edgeId)
}

export const moveEdgeLabel = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string,
  to: OrderedAnchor
): void => {
  const current = getEdge(state.draft, edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === labelId)
  if (!current || index < 0) {
    return
  }

  const label = labels[index]!
  const inverseTo: Extract<import('@whiteboard/core/types').Operation, { type: 'edge.label.move' }>['to'] = index === 0
    ? { kind: 'start' }
    : { kind: 'after', labelId: labels[index - 1]!.id }
  labels.splice(index, 1)
  const insertAt = to.kind === 'start'
    ? 0
    : to.kind === 'end'
      ? labels.length
      : (() => {
          const anchorIndex = labels.findIndex((entry) => entry.id === to.itemId)
          if (anchorIndex < 0) {
            return to.kind === 'before'
              ? 0
              : labels.length
          }
          return to.kind === 'before'
            ? anchorIndex
            : anchorIndex + 1
        })()
  labels.splice(insertAt, 0, label)
  state.inverse.prepend({
    type: 'edge.label.move',
    edgeId,
    labelId,
    to: inverseTo
  })
  state.draft.edges.set(edgeId, {
    ...current,
    labels
  })
  markEdgeUpdated(state, edgeId)
}

export const setEdgeLabelField = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string,
  field: EdgeLabelField,
  value: unknown
): void => {
  const current = getEdge(state.draft, edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === labelId)
  if (!current || index < 0) {
    throw new Error(`Edge label ${labelId} not found.`)
  }

  const label = labels[index]!
  const previous = (label as Record<string, unknown>)[field]
  state.inverse.prepend(previous === undefined
    ? {
        type: 'edge.label.field.unset',
        edgeId,
        labelId,
        field
      }
    : {
        type: 'edge.label.field.set',
        edgeId,
        labelId,
        field,
        value: json.clone(previous)
      })
  labels[index] = {
    ...label,
    [field]: json.clone(value) as never
  }
  state.draft.edges.set(edgeId, {
    ...current,
    labels
  })
  markEdgeUpdated(state, edgeId)
}

export const unsetEdgeLabelField = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string,
  field: EdgeLabelField
): void => {
  const current = getEdge(state.draft, edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === labelId)
  if (!current || index < 0) {
    throw new Error(`Edge label ${labelId} not found.`)
  }

  const label = labels[index]!
  state.inverse.prepend({
    type: 'edge.label.field.set',
    edgeId,
    labelId,
    field,
    value: json.clone((label as Record<string, unknown>)[field])
  })
  const nextLabel = {
    ...label
  } as EdgeLabel & Record<string, unknown>
  delete nextLabel[field]
  labels[index] = nextLabel
  state.draft.edges.set(edgeId, {
    ...current,
    labels
  })
  markEdgeUpdated(state, edgeId)
}

export const setEdgeLabelRecord = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string,
  scope: EdgeLabelRecordScope,
  path: Path,
  value: unknown
): void => {
  const current = getEdge(state.draft, edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === labelId)
  if (!current || index < 0) {
    throw new Error(`Edge label ${labelId} not found.`)
  }

  const label = labels[index]!
  const currentRoot = scope === 'data'
    ? label.data
    : label.style
  const previous = readRecordPath(currentRoot, path)
  state.inverse.prepend(previous === undefined
    ? {
        type: 'edge.label.record.unset',
        edgeId,
        labelId,
        scope,
        path
      }
    : {
        type: 'edge.label.record.set',
        edgeId,
        labelId,
        scope,
        path,
        value: json.clone(previous)
      })
  const result = applyRecordPathMutation(currentRoot, {
    op: 'set',
    path,
    value
  })
  if (!result.ok) {
    throw new Error(result.message)
  }

  labels[index] = {
    ...label,
    ...(scope === 'data'
      ? { data: result.value as NonNullable<typeof label.data> }
      : { style: result.value as NonNullable<typeof label.style> })
  }
  state.draft.edges.set(edgeId, {
    ...current,
    labels
  })
  markEdgeUpdated(state, edgeId)
}

export const unsetEdgeLabelRecord = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string,
  scope: EdgeLabelRecordScope,
  path: Path
): void => {
  const current = getEdge(state.draft, edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === labelId)
  if (!current || index < 0) {
    throw new Error(`Edge label ${labelId} not found.`)
  }

  const label = labels[index]!
  const currentRoot = scope === 'data'
    ? label.data
    : label.style
  state.inverse.prepend({
    type: 'edge.label.record.set',
    edgeId,
    labelId,
    scope,
    path,
    value: json.clone(readRecordPath(currentRoot, path))
  })
  const result = applyRecordPathMutation(currentRoot, {
    op: 'unset',
    path
  })
  if (!result.ok) {
    throw new Error(result.message)
  }

  labels[index] = {
    ...label,
    ...(scope === 'data'
      ? { data: result.value as NonNullable<typeof label.data> }
      : { style: result.value as NonNullable<typeof label.style> })
  }
  state.draft.edges.set(edgeId, {
    ...current,
    labels
  })
  markEdgeUpdated(state, edgeId)
}

export const insertEdgeRoutePoint = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  point: EdgeRoutePoint,
  to: OrderedAnchor
): void => {
  const current = getEdge(state.draft, edgeId)
  if (!current) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  const points = [...getManualRoutePoints(current)]
  const insertAt = to.kind === 'start'
    ? 0
    : to.kind === 'end'
      ? points.length
      : (() => {
          const anchorIndex = points.findIndex((entry) => entry.id === to.itemId)
          if (anchorIndex < 0) {
            return to.kind === 'before'
              ? 0
              : points.length
          }
          return to.kind === 'before'
            ? anchorIndex
            : anchorIndex + 1
        })()
  points.splice(insertAt, 0, point)
  state.inverse.prepend({
    type: 'edge.route.point.delete',
    edgeId,
    pointId: point.id
  })
  state.draft.edges.set(edgeId, {
    ...current,
    route: {
      kind: 'manual',
      points
    }
  })
  markEdgeUpdated(state, edgeId)
}

export const deleteEdgeRoutePoint = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  pointId: string
): void => {
  const current = getEdge(state.draft, edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === pointId)
  if (!current || index < 0) {
    return
  }

  const point = points[index]!
  state.inverse.prepend({
    type: 'edge.route.point.insert',
    edgeId,
    point: json.clone(point),
    to: index === 0
      ? { kind: 'start' }
      : { kind: 'after', pointId: points[index - 1]!.id }
  })
  const nextPoints = points.filter((entry) => entry.id !== pointId)
  state.draft.edges.set(edgeId, {
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
  markEdgeUpdated(state, edgeId)
}

export const moveEdgeRoutePoint = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  pointId: string,
  to: OrderedAnchor
): void => {
  const current = getEdge(state.draft, edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === pointId)
  if (!current || index < 0) {
    return
  }

  const point = points[index]!
  const inverseTo: Extract<import('@whiteboard/core/types').Operation, { type: 'edge.route.point.move' }>['to'] = index === 0
    ? { kind: 'start' }
    : { kind: 'after', pointId: points[index - 1]!.id }
  points.splice(index, 1)
  const insertAt = to.kind === 'start'
    ? 0
    : to.kind === 'end'
      ? points.length
      : (() => {
          const anchorIndex = points.findIndex((entry) => entry.id === to.itemId)
          if (anchorIndex < 0) {
            return to.kind === 'before'
              ? 0
              : points.length
          }
          return to.kind === 'before'
            ? anchorIndex
            : anchorIndex + 1
        })()
  points.splice(insertAt, 0, point)
  state.inverse.prepend({
    type: 'edge.route.point.move',
    edgeId,
    pointId,
    to: inverseTo
  })
  state.draft.edges.set(edgeId, {
    ...current,
    route: {
      kind: 'manual',
      points
    }
  })
  markEdgeUpdated(state, edgeId)
}

export const setEdgeRoutePointField = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  pointId: string,
  field: EdgeRoutePointField,
  value: number
): void => {
  const current = getEdge(state.draft, edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === pointId)
  if (!current || index < 0) {
    throw new Error(`Edge route point ${pointId} not found.`)
  }

  const point = points[index]!
  state.inverse.prepend({
    type: 'edge.route.point.field.set',
    edgeId,
    pointId,
    field,
    value: point[field]
  })
  points[index] = {
    ...point,
    [field]: value
  }
  state.draft.edges.set(edgeId, {
    ...current,
    route: {
      kind: 'manual',
      points
    }
  })
  markEdgeUpdated(state, edgeId)
}

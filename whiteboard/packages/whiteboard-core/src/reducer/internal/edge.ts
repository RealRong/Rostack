import { json } from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  Edge,
  EdgeFieldPatch,
  EdgeId,
  EdgeLabel,
  EdgeLabelFieldPatch,
  EdgeRoutePoint,
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

const EDGE_PATCH_FIELDS = [
  'source',
  'target',
  'type',
  'locked',
  'groupId',
  'textMode'
] as const

const LABEL_PATCH_FIELDS = [
  'text',
  't',
  'offset'
] as const

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const applyEdgeFieldPatch = (
  edge: Edge,
  fields?: EdgeFieldPatch
): Edge => {
  if (!fields) {
    return edge
  }

  let next = edge
  EDGE_PATCH_FIELDS.forEach((field) => {
    if (!hasOwn(fields, field)) {
      return
    }

    next = {
      ...next,
      [field]: json.clone(fields[field])
    }
  })
  return next
}

const buildEdgeFieldInverse = (
  edge: Edge,
  fields?: EdgeFieldPatch
): EdgeFieldPatch | undefined => {
  if (!fields) {
    return undefined
  }

  const inverse: EdgeFieldPatch = {}
  if (hasOwn(fields, 'source')) {
    inverse.source = json.clone(edge.source)
  }
  if (hasOwn(fields, 'target')) {
    inverse.target = json.clone(edge.target)
  }
  if (hasOwn(fields, 'type')) {
    inverse.type = json.clone(edge.type)
  }
  if (hasOwn(fields, 'locked')) {
    inverse.locked = json.clone(edge.locked)
  }
  if (hasOwn(fields, 'groupId')) {
    inverse.groupId = json.clone(edge.groupId)
  }
  if (hasOwn(fields, 'textMode')) {
    inverse.textMode = json.clone(edge.textMode)
  }

  return Object.keys(inverse).length > 0
    ? inverse
    : undefined
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

export const patchEdge = (
  state: WhiteboardReduceState,
  id: EdgeId,
  input: {
    fields?: EdgeFieldPatch
    record?: RecordWrite
  }
): void => {
  const current = getEdge(state.draft, id)
  if (!current) {
    throw new Error(`Edge ${id} not found.`)
  }

  const inverseFields = buildEdgeFieldInverse(current, input.fields)
  const inverseRecord = input.record
    ? draftRecord.inverse(current, input.record)
    : undefined
  const fieldPatched = applyEdgeFieldPatch(current, input.fields)
  const next = input.record
    ? draftRecord.apply(fieldPatched, input.record)
    : fieldPatched

  state.inverse.prepend({
    type: 'edge.patch',
    id,
    ...(inverseFields ? { fields: inverseFields } : {}),
    ...(inverseRecord && Object.keys(inverseRecord).length
      ? { record: inverseRecord }
      : {})
  })
  state.draft.edges.set(id, next)
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

export const patchEdgeLabel = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  labelId: string,
  input: {
    fields?: EdgeLabelFieldPatch
    record?: RecordWrite
  }
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
  const inverseFields = input.fields
    ? (() => {
        const result: EdgeLabelFieldPatch = {}
        if (hasOwn(input.fields, 'text')) {
          result.text = json.clone(label.text)
        }
        if (hasOwn(input.fields, 't')) {
          result.t = json.clone(label.t)
        }
        if (hasOwn(input.fields, 'offset')) {
          result.offset = json.clone(label.offset)
        }
        return result
      })()
    : undefined
  const inverseRecord = input.record
    ? draftRecord.inverse(label, input.record)
    : undefined

  let nextLabel = label
  LABEL_PATCH_FIELDS.forEach((field) => {
    if (!input.fields || !hasOwn(input.fields, field)) {
      return
    }

    nextLabel = {
      ...nextLabel,
      [field]: json.clone(input.fields[field])
    }
  })
  if (input.record) {
    nextLabel = draftRecord.apply(nextLabel, input.record)
  }

  state.inverse.prepend({
    type: 'edge.label.patch',
    edgeId,
    labelId,
    ...(inverseFields && Object.keys(inverseFields).length
      ? { fields: inverseFields }
      : {}),
    ...(inverseRecord && Object.keys(inverseRecord).length
      ? { record: inverseRecord }
      : {})
  })

  labels[index] = nextLabel
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

export const patchEdgeRoutePoint = (
  state: WhiteboardReduceState,
  edgeId: EdgeId,
  pointId: string,
  fields: Partial<Record<'x' | 'y', number>>
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
  const inverse: Partial<Record<'x' | 'y', number>> = {}
  if (hasOwn(fields, 'x')) {
    inverse.x = point.x
  }
  if (hasOwn(fields, 'y')) {
    inverse.y = point.y
  }
  state.inverse.prepend({
    type: 'edge.route.point.patch',
    edgeId,
    pointId,
    fields: inverse
  })
  points[index] = {
    ...point,
    ...(hasOwn(fields, 'x') ? { x: fields.x! } : {}),
    ...(hasOwn(fields, 'y') ? { y: fields.y! } : {})
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

import {
  record as draftRecord
} from '@shared/draft'
import {
  createStructuralOrderedDeleteOperation,
  createStructuralOrderedInsertOperation,
  createStructuralOrderedMoveOperation,
  type MutationStructuralOrderedDeleteOperation,
  type MutationStructuralOrderedInsertOperation,
  type MutationStructuralOrderedMoveOperation,
} from '@shared/mutation'
import {
  readEdgeLabelUpdateFromPatch
} from '@whiteboard/core/edge/update'
import type {
  Operation
} from '@whiteboard/core/types'
import {
  clone,
  same
} from './common'
import {
  emitEntityPatch,
  emitStructuralOperation
} from './effects'
import {
  EDGE_LABELS_STRUCTURE_PREFIX,
  EDGE_ROUTE_STRUCTURE_PREFIX,
  getLabels,
  getManualRoutePoints,
  readStructuralDocument,
  toStructuralOrderedAnchor,
} from './structures'
import type {
  WhiteboardCustomPlanContext
} from './types'

export const planEdgeLabelInsert = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.insert' }>
  >
): void => {
  if (!input.reader.edges.get(input.op.edgeId)) {
    return input.fail({
      code: 'invalid',
      message: `Edge ${input.op.edgeId} not found.`
    })
  }

  emitStructuralOperation(
    input,
    createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
      structure: `${EDGE_LABELS_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.label.id,
      value: clone(input.op.label)!,
      to: toStructuralOrderedAnchor(input.op.to)
    })
  )
}

export const planEdgeLabelDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.delete' }>
  >
): void => {
  const current = input.reader.edges.get(input.op.edgeId)
  if (!current || !getLabels(current).some((label) => label.id === input.op.labelId)) {
    return
  }

  emitStructuralOperation(
    input,
    createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
      structure: `${EDGE_LABELS_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.labelId
    })
  )
}

export const planEdgeLabelMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.move' }>
  >
): void => {
  const current = input.reader.edges.get(input.op.edgeId)
  if (!current || !getLabels(current).some((label) => label.id === input.op.labelId)) {
    return
  }

  const operation = createStructuralOrderedMoveOperation<MutationStructuralOrderedMoveOperation>({
    structure: `${EDGE_LABELS_STRUCTURE_PREFIX}${input.op.edgeId}`,
    itemId: input.op.labelId,
    to: toStructuralOrderedAnchor(input.op.to)
  })
  const result = readStructuralDocument({
    document: input.document,
    operation,
    fail: input.fail
  })
  if (result.historyMode === 'neutral') {
    return
  }

  emitStructuralOperation(input, operation)
}

export const planEdgeLabelPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.patch' }>
  >
): void => {
  const current = input.reader.edges.get(input.op.edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === input.op.labelId)
  if (!current || index < 0) {
    return input.fail({
      code: 'invalid',
      message: `Edge label ${input.op.labelId} not found.`
    })
  }

  const label = labels[index]!
  const update = readEdgeLabelUpdateFromPatch(input.op.patch)
  let nextLabel = clone(label)!
  if (update.fields) {
    if ('text' in update.fields) {
      nextLabel.text = clone(update.fields.text)
    }
    if ('t' in update.fields) {
      nextLabel.t = clone(update.fields.t)
    }
    if ('offset' in update.fields) {
      nextLabel.offset = clone(update.fields.offset)
    }
  }
  if (update.record) {
    nextLabel = draftRecord.apply(nextLabel, update.record)
  }
  if (same(nextLabel, label)) {
    return
  }

  labels[index] = nextLabel
  emitEntityPatch(input, 'edge', input.op.edgeId, {
    labels: labels.map((entry) => clone(entry)!)
  })
}

export const planEdgeRoutePointInsert = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.insert' }>
  >
): void => {
  if (!input.reader.edges.get(input.op.edgeId)) {
    return input.fail({
      code: 'invalid',
      message: `Edge ${input.op.edgeId} not found.`
    })
  }

  emitStructuralOperation(
    input,
    createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
      structure: `${EDGE_ROUTE_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.point.id,
      value: clone(input.op.point)!,
      to: toStructuralOrderedAnchor(input.op.to)
    })
  )
}

export const planEdgeRoutePointDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.delete' }>
  >
): void => {
  const current = input.reader.edges.get(input.op.edgeId)
  if (!current || !getManualRoutePoints(current).some((point) => point.id === input.op.pointId)) {
    return
  }

  emitStructuralOperation(
    input,
    createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
      structure: `${EDGE_ROUTE_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.pointId
    })
  )
}

export const planEdgeRoutePointMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.move' }>
  >
): void => {
  const current = input.reader.edges.get(input.op.edgeId)
  if (!current || !getManualRoutePoints(current).some((point) => point.id === input.op.pointId)) {
    return
  }

  const operation = createStructuralOrderedMoveOperation<MutationStructuralOrderedMoveOperation>({
    structure: `${EDGE_ROUTE_STRUCTURE_PREFIX}${input.op.edgeId}`,
    itemId: input.op.pointId,
    to: toStructuralOrderedAnchor(input.op.to)
  })
  const result = readStructuralDocument({
    document: input.document,
    operation,
    fail: input.fail
  })
  if (result.historyMode === 'neutral') {
    return
  }

  emitStructuralOperation(input, operation)
}

export const planEdgeRoutePointPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.patch' }>
  >
): void => {
  const current = input.reader.edges.get(input.op.edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === input.op.pointId)
  if (!current || index < 0) {
    return input.fail({
      code: 'invalid',
      message: `Edge route point ${input.op.pointId} not found.`
    })
  }

  const point = points[index]!
  const nextPoint = {
    ...point,
    ...clone(input.op.patch)
  }
  if (same(nextPoint, point)) {
    return
  }

  points[index] = nextPoint
  emitEntityPatch(input, 'edge', input.op.edgeId, {
    route: {
      kind: 'manual',
      points: points.map((entry) => clone(entry)!)
    }
  })
}

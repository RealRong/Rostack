import {
  record as draftRecord
} from '@shared/draft'
import {
  readEdgeLabelUpdateFromPatch
} from '@whiteboard/core/edge/update'
import type {
  EdgeId,
  EdgeLabel,
  EdgeRoutePoint,
  Operation
} from '@whiteboard/core/types'
import {
  clone
} from './common'
import {
  EDGE_LABELS_STRUCTURE_PREFIX,
  EDGE_ROUTE_STRUCTURE_PREFIX,
  getLabels,
  getManualRoutePoints,
} from './structures'
import type {
  WhiteboardCustomPlanContext
} from './types'
import {
  planOrderedDelete,
  planOrderedInsert,
  planOrderedMove,
  planOrderedPatch,
  type OrderedEdgeCollectionConfig
} from './orderedEdge'

const edgeLabels = {
  structure: (edgeId: EdgeId) => `${EDGE_LABELS_STRUCTURE_PREFIX}${edgeId}`,
  readItems: getLabels,
  itemId: (label: EdgeLabel) => label.id,
  readInsert: (op: Extract<Operation, { type: 'edge.label.insert' }>) => ({
    edgeId: op.edgeId,
    item: op.label,
    to: op.to
  }),
  readDelete: (op: Extract<Operation, { type: 'edge.label.delete' }>) => ({
    edgeId: op.edgeId,
    itemId: op.labelId
  }),
  readMove: (op: Extract<Operation, { type: 'edge.label.move' }>) => ({
    edgeId: op.edgeId,
    itemId: op.labelId,
    to: op.to
  }),
  readPatch: (op: Extract<Operation, { type: 'edge.label.patch' }>) => ({
    edgeId: op.edgeId,
    itemId: op.labelId
  }),
  patchItem: (
    label: EdgeLabel,
    op: Extract<Operation, { type: 'edge.label.patch' }>
  ): EdgeLabel => {
    const update = readEdgeLabelUpdateFromPatch(op.patch)
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
    return nextLabel
  },
  writePatch: (items: readonly EdgeLabel[]) => ({
    labels: items.map((entry) => clone(entry)!)
  }),
  missingItemMessage: (itemId: string) => `Edge label ${itemId} not found.`
} satisfies OrderedEdgeCollectionConfig<
  EdgeLabel,
  Extract<Operation, { type: 'edge.label.insert' }>,
  Extract<Operation, { type: 'edge.label.delete' }>,
  Extract<Operation, { type: 'edge.label.move' }>,
  Extract<Operation, { type: 'edge.label.patch' }>
>

const edgeRoutePoints = {
  structure: (edgeId: EdgeId) => `${EDGE_ROUTE_STRUCTURE_PREFIX}${edgeId}`,
  readItems: getManualRoutePoints,
  itemId: (point: EdgeRoutePoint) => point.id,
  readInsert: (op: Extract<Operation, { type: 'edge.route.point.insert' }>) => ({
    edgeId: op.edgeId,
    item: op.point,
    to: op.to
  }),
  readDelete: (op: Extract<Operation, { type: 'edge.route.point.delete' }>) => ({
    edgeId: op.edgeId,
    itemId: op.pointId
  }),
  readMove: (op: Extract<Operation, { type: 'edge.route.point.move' }>) => ({
    edgeId: op.edgeId,
    itemId: op.pointId,
    to: op.to
  }),
  readPatch: (op: Extract<Operation, { type: 'edge.route.point.patch' }>) => ({
    edgeId: op.edgeId,
    itemId: op.pointId
  }),
  patchItem: (
    point: EdgeRoutePoint,
    op: Extract<Operation, { type: 'edge.route.point.patch' }>
  ): EdgeRoutePoint => ({
    ...point,
    ...clone(op.patch)
  }),
  writePatch: (items: readonly EdgeRoutePoint[]) => ({
    route: items.length > 0
      ? {
          kind: 'manual' as const,
          points: items.map((entry) => clone(entry)!)
        }
      : {
          kind: 'auto' as const
        }
  }),
  missingItemMessage: (itemId: string) => `Edge route point ${itemId} not found.`
} satisfies OrderedEdgeCollectionConfig<
  EdgeRoutePoint,
  Extract<Operation, { type: 'edge.route.point.insert' }>,
  Extract<Operation, { type: 'edge.route.point.delete' }>,
  Extract<Operation, { type: 'edge.route.point.move' }>,
  Extract<Operation, { type: 'edge.route.point.patch' }>
>

export const planEdgeLabelInsert = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.insert' }>
  >
): void => {
  planOrderedInsert(input, edgeLabels, (item) => clone(item)!)
}

export const planEdgeLabelDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.delete' }>
  >
): void => {
  planOrderedDelete(input, edgeLabels)
}

export const planEdgeLabelMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.move' }>
  >
): void => {
  planOrderedMove(input, edgeLabels)
}

export const planEdgeLabelPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.patch' }>
  >
): void => {
  planOrderedPatch(input, edgeLabels)
}

export const planEdgeRoutePointInsert = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.insert' }>
  >
): void => {
  planOrderedInsert(input, edgeRoutePoints, (item) => clone(item)!)
}

export const planEdgeRoutePointDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.delete' }>
  >
): void => {
  planOrderedDelete(input, edgeRoutePoints)
}

export const planEdgeRoutePointMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.move' }>
  >
): void => {
  planOrderedMove(input, edgeRoutePoints)
}

export const planEdgeRoutePointPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.patch' }>
  >
): void => {
  planOrderedPatch(input, edgeRoutePoints)
}

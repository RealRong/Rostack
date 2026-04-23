import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  EdgeId,
  Point
} from '@whiteboard/core/types'
import { isListEqual } from '@shared/projection-runtime'
import type { Input, EdgeView } from '../../contracts/editor'
import type { GraphDelta } from '../../contracts/delta'
import type {
  GraphEdgeEntry,
  WorkingState
} from '../../contracts/working'
import { isEdgeViewEqual } from '../equality'
import {
  isEdgeLabelViewEqual,
  isPointEqual,
  isRectEqual
} from '../geometry'
import { buildEdgeView } from '../views'
import { markGeometryTouched } from './delta'
import { patchFamilyEntry } from './helpers'

const readEdgeEntry = (
  input: Input,
  edgeId: EdgeId
): GraphEdgeEntry | undefined => {
  const edge = input.document.snapshot.state.facts.entities.edges.get(edgeId)
  if (!edge) {
    return undefined
  }

  return {
    base: {
      edge,
      nodes: input.document.snapshot.state.facts.relations.edgeNodes.get(edgeId) ?? {}
    },
    draft: input.session.draft.edges.get(edgeId),
    preview: input.session.preview.edges.get(edgeId)
  }
}

const isEdgeEndsEqual = (
  left: EdgeView['route']['ends'],
  right: EdgeView['route']['ends']
) => left === right || (
  left !== undefined
  && right !== undefined
  && edgeApi.equal.resolvedEnd(left.source, right.source)
  && edgeApi.equal.resolvedEnd(left.target, right.target)
)

const isEdgeHandleEqual = (
  left: EdgeView['route']['handles'][number],
  right: EdgeView['route']['handles'][number]
): boolean => {
  if (left === right) {
    return true
  }

  if (left.kind !== right.kind || !isPointEqual(left.point, right.point)) {
    return false
  }

  switch (left.kind) {
    case 'end':
      return right.kind === 'end' && left.end === right.end
    case 'anchor':
      return (
        right.kind === 'anchor'
        && left.index === right.index
        && left.mode === right.mode
      )
    case 'segment':
      return (
        right.kind === 'segment'
        && left.role === right.role
        && left.insertIndex === right.insertIndex
        && left.segmentIndex === right.segmentIndex
        && left.axis === right.axis
      )
  }
}

const isEdgeGeometryChanged = (
  previous: EdgeView | undefined,
  next: EdgeView | undefined
): boolean => (
  previous === undefined
  || next === undefined
  || previous.route.svgPath !== next.route.svgPath
  || !isRectEqual(previous.route.bounds, next.route.bounds)
  || !isPointEqual(previous.route.source, next.route.source)
  || !isPointEqual(previous.route.target, next.route.target)
  || !isEdgeEndsEqual(previous.route.ends, next.route.ends)
  || !isListEqual(previous.route.points, next.route.points, isPointEqual)
  || !isListEqual(previous.route.handles, next.route.handles, isEdgeHandleEqual)
  || !isListEqual(previous.route.labels, next.route.labels, isEdgeLabelViewEqual)
  || previous.box?.pad !== next.box?.pad
  || !isRectEqual(previous.box?.rect, next.box?.rect)
)

export const patchEdge = (input: {
  input: Input
  working: WorkingState
  delta: GraphDelta
  edgeId: EdgeId
}): boolean => {
  const previous = input.working.graph.edges.get(input.edgeId)
  const entry = readEdgeEntry(input.input, input.edgeId)
  const next = entry
    ? buildEdgeView({
        edgeId: input.edgeId,
        entry,
        nodes: input.working.graph.nodes,
        labelMeasures: input.input.measure.text.edgeLabels.get(input.edgeId),
        edit: input.input.session.edit
      })
    : undefined
  const action = patchFamilyEntry({
    family: input.working.graph.edges,
    id: input.edgeId,
    next,
    isEqual: isEdgeViewEqual,
    delta: input.delta.entities.edges
  })
  const current = input.working.graph.edges.get(input.edgeId)
  const geometryTouched = action === 'added'
    || action === 'removed'
    || isEdgeGeometryChanged(previous, current)

  if (geometryTouched) {
    markGeometryTouched(input.delta.geometry.edges, input.edgeId)
  }

  return action !== 'unchanged'
}

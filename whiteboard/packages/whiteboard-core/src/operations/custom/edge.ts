import type {
  MutationOrderedEffect
} from '@shared/mutation'
import {
  readStructuralEffectResult
} from '@shared/mutation/engine'
import type {
  Operation
} from '@whiteboard/core/types'
import {
  clone
} from './common'
import {
  edgeLabelsStructure,
  edgeRoutePointsStructure,
  getLabels,
  getManualRoutePoints,
  toStructuralOrderedAnchor,
  whiteboardStructures
} from './structures'
import type {
  WhiteboardCustomPlanContext
} from './types'

const previewOrderedEffect = (
  input: WhiteboardCustomPlanContext,
  effect: MutationOrderedEffect
): boolean => {
  const result = readStructuralEffectResult({
    document: input.document,
    effect,
    structures: whiteboardStructures
  })
  if (!result.ok) {
    return input.fail({
      code: 'invalid',
      message: result.error.message
    })
  }

  return result.data.historyMode !== 'neutral'
}

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

  input.effects.structure.ordered.insert(
    edgeLabelsStructure(input.op.edgeId),
    input.op.label.id,
    clone(input.op.label)!,
    toStructuralOrderedAnchor(input.op.to)
  )
}

export const planEdgeLabelDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.delete' }>
  >
): void => {
  const edge = input.reader.edges.get(input.op.edgeId)
  if (!edge || !getLabels(edge).some((label) => label.id === input.op.labelId)) {
    return
  }

  input.effects.structure.ordered.delete(
    edgeLabelsStructure(input.op.edgeId),
    input.op.labelId
  )
}

export const planEdgeLabelMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.move' }>
  >
): void => {
  const edge = input.reader.edges.get(input.op.edgeId)
  if (!edge || !getLabels(edge).some((label) => label.id === input.op.labelId)) {
    return
  }

  const effect: MutationOrderedEffect = {
    type: 'ordered.move',
    structure: edgeLabelsStructure(input.op.edgeId),
    itemId: input.op.labelId,
    to: toStructuralOrderedAnchor(input.op.to)
  }
  if (!previewOrderedEffect(input, effect)) {
    return
  }

  input.effects.structure.ordered.move(
    effect.structure,
    effect.itemId,
    effect.to
  )
}

export const planEdgeLabelPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.label.patch' }>
  >
): void => {
  const edge = input.reader.edges.get(input.op.edgeId)
  if (!edge || !getLabels(edge).some((label) => label.id === input.op.labelId)) {
    return input.fail({
      code: 'invalid',
      message: `Edge label ${input.op.labelId} not found.`
    })
  }

  const effect: MutationOrderedEffect = {
    type: 'ordered.patch',
    structure: edgeLabelsStructure(input.op.edgeId),
    itemId: input.op.labelId,
    patch: clone(input.op.patch)!
  }
  if (!previewOrderedEffect(input, effect)) {
    return
  }

  input.effects.structure.ordered.patch(
    effect.structure,
    effect.itemId,
    effect.patch
  )
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

  input.effects.structure.ordered.insert(
    edgeRoutePointsStructure(input.op.edgeId),
    input.op.point.id,
    clone(input.op.point)!,
    toStructuralOrderedAnchor(input.op.to)
  )
}

export const planEdgeRoutePointDelete = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.delete' }>
  >
): void => {
  const edge = input.reader.edges.get(input.op.edgeId)
  if (!edge || !getManualRoutePoints(edge).some((point) => point.id === input.op.pointId)) {
    return
  }

  input.effects.structure.ordered.delete(
    edgeRoutePointsStructure(input.op.edgeId),
    input.op.pointId
  )
}

export const planEdgeRoutePointMove = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.move' }>
  >
): void => {
  const edge = input.reader.edges.get(input.op.edgeId)
  if (!edge || !getManualRoutePoints(edge).some((point) => point.id === input.op.pointId)) {
    return
  }

  const effect: MutationOrderedEffect = {
    type: 'ordered.move',
    structure: edgeRoutePointsStructure(input.op.edgeId),
    itemId: input.op.pointId,
    to: toStructuralOrderedAnchor(input.op.to)
  }
  if (!previewOrderedEffect(input, effect)) {
    return
  }

  input.effects.structure.ordered.move(
    effect.structure,
    effect.itemId,
    effect.to
  )
}

export const planEdgeRoutePointPatch = (
  input: WhiteboardCustomPlanContext<
    Extract<Operation, { type: 'edge.route.point.patch' }>
  >
): void => {
  const edge = input.reader.edges.get(input.op.edgeId)
  if (!edge || !getManualRoutePoints(edge).some((point) => point.id === input.op.pointId)) {
    return input.fail({
      code: 'invalid',
      message: `Edge route point ${input.op.pointId} not found.`
    })
  }

  const effect: MutationOrderedEffect = {
    type: 'ordered.patch',
    structure: edgeRoutePointsStructure(input.op.edgeId),
    itemId: input.op.pointId,
    patch: clone(input.op.patch)!
  }
  if (!previewOrderedEffect(input, effect)) {
    return
  }

  input.effects.structure.ordered.patch(
    effect.structure,
    effect.itemId,
    effect.patch
  )
}

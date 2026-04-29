import {
  json
} from '@shared/core'
import type {
  MutationDeltaInput,
  MutationFootprint
} from '@shared/mutation'
import {
  compileMutationEntityEffects
} from '@shared/mutation/engine'
import { whiteboardEntities } from '@whiteboard/core/operations/entities'
import type {
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Operation,
  ResultCode
} from '@whiteboard/core/types'

export type WhiteboardCustomOperation = Exclude<
  Operation,
  | { type: 'document.create' }
  | { type: 'document.patch' }
  | { type: 'node.create' }
  | { type: 'node.patch' }
  | { type: 'node.delete' }
  | { type: 'edge.create' }
  | { type: 'edge.patch' }
  | { type: 'edge.delete' }
  | { type: 'group.create' }
  | { type: 'group.patch' }
  | { type: 'group.delete' }
>

export type WhiteboardCustomCode = ResultCode

export type CustomHistory = {
  inverse: readonly Operation[]
  forward?: readonly Operation[]
}

export type CustomResult = {
  document: Document
  delta: MutationDeltaInput
  footprint: readonly MutationFootprint[]
  history: CustomHistory
}

export type EntityDeltaInput<TId extends string = string> = {
  created?: readonly TId[]
  deleted?: readonly TId[]
  touched?: readonly TId[]
}

type WhiteboardCustomEffects = {
  canvasOrder?: boolean
  nodes?: EntityDeltaInput<NodeId>
  edges?: EntityDeltaInput<EdgeId>
  groups?: EntityDeltaInput<GroupId>
  mindmaps?: EntityDeltaInput<MindmapId>
}

export const clone = <T,>(
  value: T
): T => value === undefined
  ? value
  : json.clone(value)

export const uniqueSorted = (
  ids: Iterable<string>
): readonly string[] => [...new Set(ids)].sort()

export const entityKey = (
  family: string,
  id: string
): MutationFootprint => ({
  kind: 'entity',
  family,
  id
})

export const fieldKey = (
  family: string,
  id: string,
  field: string
): MutationFootprint => ({
  kind: 'field',
  family,
  id,
  field
})

export const recordKey = (
  family: string,
  id: string,
  scope: string,
  path: string
): MutationFootprint => ({
  kind: 'record',
  family,
  id,
  scope,
  path
})

export const relationKey = (
  family: string,
  id: string,
  relation: string,
  target?: string
): MutationFootprint => ({
  kind: 'relation',
  family,
  id,
  relation,
  ...(target === undefined ? {} : { target })
})

export const createWhiteboardCustomResult = (input: {
  before: Document
  document: Document
  history: CustomHistory
  effects?: WhiteboardCustomEffects
  footprintEffects?: WhiteboardCustomEffects
  extraFootprint?: readonly MutationFootprint[]
}): CustomResult => {
  const readEntityEffects = (
    effects: WhiteboardCustomEffects | undefined
  ) => [
    ...(effects?.nodes
      ? [{
          family: 'node',
          ...effects.nodes
        }]
      : []),
    ...(effects?.edges
      ? [{
          family: 'edge',
          ...effects.edges
        }]
      : []),
    ...(effects?.groups
      ? [{
          family: 'group',
          ...effects.groups
        }]
      : []),
    ...(effects?.mindmaps
      ? [{
          family: 'mindmap',
          ...effects.mindmaps
        }]
      : [])
  ]

  const entityEffects = [
    ...readEntityEffects(input.effects)
  ]

  const compiledDelta = compileMutationEntityEffects({
    entities: whiteboardEntities,
    before: input.before,
    after: input.document,
    effects: entityEffects,
    extraDelta: input.effects?.canvasOrder
      ? {
          changes: {
            'canvas.order': true
          }
        }
      : undefined,
    extraFootprint: []
  })
  const compiledFootprint = compileMutationEntityEffects({
    entities: whiteboardEntities,
    before: input.before,
    after: input.document,
    effects: readEntityEffects(input.footprintEffects ?? input.effects),
    extraFootprint: input.extraFootprint
  })

  return {
    document: input.document,
    delta: compiledDelta.delta,
    footprint: compiledFootprint.footprint,
    history: input.history
  }
}

import {
  json
} from '@shared/core'
import type {
  MutationDeltaInput,
  MutationFootprint
} from '@shared/mutation'
import type {
  Document,
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
  document: Document
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
  history: CustomHistory
}): CustomResult => {
  return {
    document: input.document,
    delta: input.delta ?? {},
    footprint: input.footprint ?? [],
    history: input.history
  }
}

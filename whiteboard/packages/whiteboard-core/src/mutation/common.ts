import {
  equal,
  json
} from '@shared/core'
import type {
  MutationFootprint
} from '@shared/mutation'

export const same = (
  left: unknown,
  right: unknown
): boolean => equal.sameJsonValue(left, right)

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

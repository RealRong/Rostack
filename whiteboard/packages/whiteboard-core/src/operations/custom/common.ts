import {
  equal,
  json
} from '@shared/core'
import type {
  MutationFootprint
} from '@shared/mutation'

export const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

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

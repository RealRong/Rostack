import {
  equal,
  json
} from '@shared/core'

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

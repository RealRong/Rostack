import type {
  MutationChange,
  MutationDelta
} from '@shared/mutation'

type MutationChangeObject = Exclude<MutationChange, true | readonly string[]>

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const readMutationChange = (
  delta: MutationDelta,
  key: string
): MutationChange | undefined => delta.changes?.[key]

export const readChangeIds = (
  change: MutationChange | undefined
): readonly string[] | 'all' | undefined => {
  if (!change) {
    return undefined
  }

  if (change === true) {
    return 'all'
  }

  if (Array.isArray(change)) {
    return change
  }

  return (change as MutationChangeObject).ids
}

export const readChangePaths = (
  change: MutationChange | undefined
): Record<string, readonly string[] | 'all'> | 'all' | undefined => {
  if (!change) {
    return undefined
  }

  if (change === true) {
    return 'all'
  }

  if (Array.isArray(change)) {
    return undefined
  }

  return (change as MutationChangeObject).paths
}

export const readChangePayload = <T>(
  change: MutationChange | undefined,
  key: string
): T | undefined => (
  change
  && !Array.isArray(change)
  && change !== true
  && hasOwn(change, key)
)
  ? (change as Record<string, unknown>)[key] as T
  : undefined

export const hasDeltaChange = (
  delta: MutationDelta,
  key: string
): boolean => readMutationChange(delta, key) !== undefined

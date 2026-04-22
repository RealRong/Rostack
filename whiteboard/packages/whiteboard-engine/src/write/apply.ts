import { reduceOperations } from '@whiteboard/core/kernel'
import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'
import { failure } from '../result'
import { createWriteDraft } from './draft'
import type { WriteDraft } from './types'

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }

  return Date.now()
}

export const applyOperations = <T,>(
  document: Document,
  ops: readonly Operation[],
  origin: Origin,
  value: T
): WriteDraft<T> => {
  const reduced = reduceOperations(document, ops, {
    now,
    origin
  })

  if (!reduced.ok) {
    return failure(
      reduced.error.code,
      reduced.error.message,
      reduced.error.details
    )
  }

  return createWriteDraft(reduced, {
    origin,
    ops,
    value
  })
}

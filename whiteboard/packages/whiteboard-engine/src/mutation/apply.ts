import { scheduler } from '@shared/core'
import { reduceOperations } from '@whiteboard/core/kernel'
import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'
import { failure } from '../result'
import { createWriteDraft } from './draft'
import type { WriteDraft } from './types'

export const applyOperations = <T,>(
  document: Document,
  ops: readonly Operation[],
  origin: Origin,
  value: T
): WriteDraft<T> => {
  const reduced = reduceOperations(document, ops, {
    now: scheduler.readMonotonicNow,
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

import {
  mutationApply,
  type MutationApplyResult
} from '@shared/mutation'
import { scheduler } from '@shared/core'
import { reduceOperations } from '@whiteboard/core/kernel'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'
import { failure } from '../result'
import type { WhiteboardMutationExtra } from './types'

export type WhiteboardApplyResult = MutationApplyResult<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardMutationExtra
>

export const applyWhiteboardOperations = (
  document: Document,
  ops: readonly Operation[],
  origin: Origin
): WhiteboardApplyResult => {
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

  return mutationApply.success({
    doc: reduced.data.doc,
    forward: ops,
    inverse: reduced.data.inverse,
    footprint: reduced.data.history.footprint,
    extra: {
      changes: reduced.data.changes
    }
  })
}

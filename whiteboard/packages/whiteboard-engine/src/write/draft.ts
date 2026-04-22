import type {
  Operation,
  Origin
} from '@whiteboard/core/types'
import type { KernelReduceResult } from '@whiteboard/core/kernel'
import type { WriteDraft } from './types'

export const createWriteDraft = <T>(
  reduced: Extract<KernelReduceResult, { ok: true }>,
  input: {
    origin: Origin
    ops: readonly Operation[]
    value: T
  }
): WriteDraft<T> => ({
  ok: true,
  origin: input.origin,
  doc: reduced.data.doc,
  ops: input.ops,
  inverse: reduced.data.inverse,
  changes: reduced.data.changes,
  history: reduced.data.history,
  value: input.value
})

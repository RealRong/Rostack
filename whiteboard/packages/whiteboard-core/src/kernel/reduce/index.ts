import { validateLockOperations } from '@whiteboard/core/lock'
import { err } from '@whiteboard/core/result'
import { createReducerTx } from '@whiteboard/core/kernel/reduce/tx'
import { dispatchOperation } from '@whiteboard/core/kernel/reduce/dispatch'
import { readLockViolationMessage } from '@whiteboard/core/kernel/reduce/commit'
import {
  collect,
  serializeHistoryKey
} from '@whiteboard/core/spec/history'
import type {
  Document,
  KernelContext,
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'

export const reduceOperations = (
  document: Document,
  operations: readonly Operation[],
  ctx: KernelContext = {}
): KernelReduceResult => {
  const origin = ctx.origin ?? 'user'
  const violation = validateLockOperations({
    document,
    operations,
    origin
  })
  if (violation) {
    return err(
      'cancelled',
      readLockViolationMessage(violation.reason, violation.operation)
    )
  }

  const tx = createReducerTx(document)

  for (const operation of operations) {
    collect.operation({
      read: tx.read,
      draft: tx._runtime.draft,
      add: (key) => {
        tx._runtime.history.footprint.set(serializeHistoryKey(key), key)
      },
      addMany: (keys) => {
        keys.forEach((key) => {
          tx._runtime.history.footprint.set(serializeHistoryKey(key), key)
        })
      }
    }, operation)
    dispatchOperation(tx, operation)
    if (tx._runtime.shortCircuit) {
      return tx.commit.result()
    }
  }

  const reconciled = tx.reconcile.run()
  if (!reconciled.ok) {
    return reconciled
  }

  return tx.commit.result()
}

import { validateLockOperations } from '@whiteboard/core/lock'
import { err } from '@whiteboard/core/result'
import { createReducerTx } from '@whiteboard/core/kernel/reduce/tx'
import { dispatchOperation } from '@whiteboard/core/kernel/reduce/dispatch'
import { readLockViolationMessage } from '@whiteboard/core/kernel/reduce/commit'
import { collect } from '@whiteboard/core/spec/history'
import { apply } from '@shared/mutation'
import type {
  Document,
  KernelContext,
  KernelReduceResult,
  Operation
} from '@whiteboard/core/types'
import { serializeHistoryKey } from '@whiteboard/core/spec/history'

type ReduceFailure = {
  kind: 'reduce-failure'
  result: KernelReduceResult
}

const createReduceFailure = (
  result: KernelReduceResult
): ReduceFailure => ({
  kind: 'reduce-failure',
  result
})

const isReduceFailure = (
  value: unknown
): value is ReduceFailure => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (value as { kind?: string }).kind === 'reduce-failure'
)

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

  try {
    const applied = apply<
      Document,
      Operation,
      import('@whiteboard/core/spec/history').HistoryKey,
      {
        tx?: ReturnType<typeof createReducerTx>
        stopped: boolean
      },
      {
        result: KernelReduceResult
      }
    >({
      doc: document,
      ops: operations,
      serializeKey: serializeHistoryKey,
      model: {
        init: () => ({
          tx: undefined,
          stopped: false
        }),
        step: (applyCtx, operation) => {
          if (applyCtx.state.stopped) {
            return
          }

          const tx = applyCtx.state.tx ?? (applyCtx.state.tx = createReducerTx(
            applyCtx.base,
            {
              inverse: applyCtx.inverse,
              footprint: applyCtx.footprint
            }
          ))

          collect.operation({
            read: tx.read,
            draft: tx._runtime.draft,
            add: applyCtx.footprint.add,
            addMany: applyCtx.footprint.addMany
          }, operation)
          dispatchOperation(tx, operation)
          if (tx._runtime.shortCircuit) {
            applyCtx.state.stopped = true
          }
        },
        settle: (applyCtx) => {
          const tx = applyCtx.state.tx ?? (applyCtx.state.tx = createReducerTx(
            applyCtx.base,
            {
              inverse: applyCtx.inverse,
              footprint: applyCtx.footprint
            }
          ))
          if (applyCtx.state.stopped) {
            return
          }

          const reconciled = tx.reconcile.run()
          if (!reconciled.ok) {
            throw createReduceFailure(reconciled)
          }
        },
        done: (applyCtx) => {
          const tx = applyCtx.state.tx ?? createReducerTx(
            applyCtx.base,
            {
              inverse: applyCtx.inverse,
              footprint: applyCtx.footprint
            }
          )
          const result = tx.commit.result()
          if (result.ok) {
            applyCtx.replace(result.data.doc)
          }

          return {
            result
          }
        }
      }
    })

    return applied.extra.result
  } catch (error) {
    if (isReduceFailure(error)) {
      return error.result
    }
    throw error
  }
}

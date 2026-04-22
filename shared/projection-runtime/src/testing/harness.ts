import type * as runtime from '../contracts/runtime'
import type * as testing from '../contracts/testing'
import { createRuntime } from '../runtime/createRuntime'

export const createHarness = <
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TDirty = never,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
>(
  spec: runtime.Spec<
    TInput,
    TWorking,
    TSnapshot,
    TChange,
    TPhaseName,
    TDirty,
    TPhaseChange,
    TPhaseMetrics
  >
): testing.Harness<
  TInput,
  TSnapshot,
  TChange,
  TPhaseName,
  TPhaseMetrics
> => {
  const runtime = createRuntime(spec)
  let lastTrace:
    | import('../contracts/trace').Run<TPhaseName, TPhaseMetrics>
    | undefined

  return {
    snapshot: runtime.snapshot,
    update: (input) => {
      const result = runtime.update(input)
      lastTrace = result.trace
      return result
    },
    lastTrace: () => lastTrace
  }
}

import type * as projector from '../contracts/projector'
import type * as testing from '../contracts/testing'
import { createProjector } from '../projector/createProjector'

export const createHarness = <
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TScopeMap extends import('../contracts/scope').PhaseScopeMap<TPhaseName> = import('../contracts/scope').DefaultPhaseScopeMap<TPhaseName>,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
>(
  spec: projector.Spec<
    TInput,
    TWorking,
    TSnapshot,
    TChange,
    TPhaseName,
    TScopeMap,
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
  const runtime = createProjector(spec)
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

import type * as runtime from '../contracts/runtime'
import { createPhaseGraph } from '../dirty/fanout'
import { publishRuntimeResult } from './publish'
import { createRuntimeState } from './state'
import { runRuntimeUpdate } from './update'

export const createRuntime = <
  TInput,
  TInputChange,
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
    TInputChange,
    TWorking,
    TSnapshot,
    TChange,
    TPhaseName,
    TDirty,
    TPhaseChange,
    TPhaseMetrics
  >
): runtime.Instance<
  TInput,
  TInputChange,
  TSnapshot,
  TChange,
  TPhaseName,
  TPhaseMetrics
> => {
  const graph = createPhaseGraph(spec.phases)
  const state = createRuntimeState<
    TWorking,
    TSnapshot,
    TChange,
    TPhaseName,
    TPhaseMetrics
  >(
    spec.createWorking(),
    spec.createSnapshot()
  )

  return {
    snapshot: () => state.snapshot,
    update: (input, change) => {
      const result = runRuntimeUpdate({
        spec,
        graph,
        state,
        nextInput: input,
        inputChange: change
      })

      publishRuntimeResult(state, result)
      return result
    },
    subscribe: (listener) => {
      state.listeners.add(listener)
      return () => {
        state.listeners.delete(listener)
      }
    }
  }
}

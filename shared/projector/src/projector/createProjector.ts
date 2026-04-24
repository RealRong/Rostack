import type * as projector from '../contracts/projector'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeMap
} from '../contracts/scope'
import { createPhaseGraph } from '../dirty/fanout'
import { publishProjectorResult } from './publish'
import { createProjectorState } from './state'
import { runProjectorUpdate } from './update'

export const createProjector = <
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>,
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
): projector.Instance<
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName,
  TPhaseMetrics
> => {
  const graph = createPhaseGraph<
    TPhaseName,
    projector.PhaseEntry<
      TInput,
      TWorking,
      TSnapshot,
      TPhaseName,
      TScopeMap,
      TPhaseChange,
      TPhaseMetrics
    >
  >(spec.phases)
  const state = createProjectorState<
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
    working: () => state.working,
    update: (input) => {
      const result = runProjectorUpdate({
        spec,
        graph,
        state,
        nextInput: input
      })

      publishProjectorResult(state, result)
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

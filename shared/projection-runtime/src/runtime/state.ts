import type * as runtime from '../contracts/runtime'
import type { Revision } from '../contracts/core'

export interface RuntimeState<
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
> {
  revision: Revision
  working: TWorking
  snapshot: TSnapshot
  listeners: Set<
    (result: runtime.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>) => void
  >
}

export const createRuntimeState = <
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
>(
  working: TWorking,
  snapshot: TSnapshot
): RuntimeState<TWorking, TSnapshot, TChange, TPhaseName, TPhaseMetrics> => ({
  revision: 0,
  working,
  snapshot,
  listeners: new Set()
})

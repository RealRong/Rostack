import type * as projector from '../contracts/projector'
import type { Revision } from '../contracts/core'

export interface ProjectorState<
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
    (result: projector.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>) => void
  >
}

export const createProjectorState = <
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
>(
  working: TWorking,
  snapshot: TSnapshot
): ProjectorState<TWorking, TSnapshot, TChange, TPhaseName, TPhaseMetrics> => ({
  revision: 0,
  working,
  snapshot,
  listeners: new Set()
})

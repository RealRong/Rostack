import type * as projector from '../contracts/projector'
import type { ProjectorState } from './state'

export const publishProjectorResult = <
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
>(
  state: ProjectorState<TWorking, TSnapshot, TChange, TPhaseName, TPhaseMetrics>,
  result: projector.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>
) => {
  state.revision = result.trace.revision
  state.snapshot = result.snapshot

  state.listeners.forEach((listener) => {
    listener(result)
  })
}

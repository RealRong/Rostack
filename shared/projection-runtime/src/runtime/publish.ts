import type * as runtime from '../contracts/runtime'
import type { RuntimeState } from './state'

export const publishRuntimeResult = <
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
>(
  state: RuntimeState<TWorking, TSnapshot, TChange, TPhaseName, TPhaseMetrics>,
  result: runtime.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>
) => {
  state.revision = result.trace.revision
  state.snapshot = result.snapshot

  state.listeners.forEach((listener) => {
    listener(result)
  })
}

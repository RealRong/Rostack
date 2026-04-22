import type * as runtime from './runtime'
import type * as trace from './trace'

export interface Harness<
  TInput,
  TInputChange,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
> {
  snapshot(): TSnapshot
  update(
    input: TInput,
    change: TInputChange
  ): runtime.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>
  lastTrace(): trace.Run<TPhaseName, TPhaseMetrics> | undefined
}

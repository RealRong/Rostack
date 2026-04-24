import type * as projector from './projector'
import type * as trace from './trace'

export interface Harness<
  TInput,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
> {
  snapshot(): TSnapshot
  update(
    input: TInput
  ): projector.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>
  lastTrace(): trace.Run<TPhaseName, TPhaseMetrics> | undefined
}

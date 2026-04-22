import type * as phase from './phase'
import type * as trace from './trace'
import type { Revision } from './core'

export interface Context<
  TInput,
  TWorking,
  TSnapshot,
  TDirty = never
> {
  input: TInput
  previous: TSnapshot
  working: TWorking
  dirty?: ReadonlySet<TDirty>
}

export interface Plan<TPhaseName extends string, TDirty = never> {
  phases: ReadonlySet<TPhaseName>
  dirty?: ReadonlyMap<TPhaseName, ReadonlySet<TDirty>>
}

export interface Planner<
  TInput,
  TSnapshot,
  TPhaseName extends string,
  TDirty = never
> {
  plan(input: {
    input: TInput
    previous: TSnapshot
  }): Plan<TPhaseName, TDirty>
}

export interface PublishResult<TSnapshot, TChange> {
  snapshot: TSnapshot
  change: TChange
}

export interface Publisher<TWorking, TSnapshot, TChange> {
  publish(input: {
    revision: Revision
    previous: TSnapshot
    working: TWorking
  }): PublishResult<TSnapshot, TChange>
}

export interface Result<
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
> {
  snapshot: TSnapshot
  change: TChange
  trace: trace.Run<TPhaseName, TPhaseMetrics>
}

export interface Spec<
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TDirty = never,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
> {
  createWorking(): TWorking
  createSnapshot(): TSnapshot
  planner: Planner<TInput, TSnapshot, TPhaseName, TDirty>
  publisher: Publisher<TWorking, TSnapshot, TChange>
  phases: readonly phase.Spec<
    TPhaseName,
    Context<TInput, TWorking, TSnapshot, TDirty>,
    TPhaseChange,
    TPhaseMetrics
  >[]
}

export interface Instance<
  TInput,
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
> {
  snapshot(): TSnapshot
  update(
    input: TInput
  ): Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>
  subscribe(
    listener: (result: Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>) => void
  ): () => void
}

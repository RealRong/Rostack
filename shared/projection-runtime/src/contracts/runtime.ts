import type * as phase from './phase'
import type * as trace from './trace'
import type { Revision } from './core'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeInput,
  PhaseScopeMap
} from './scope'

export interface Context<
  TInput,
  TWorking,
  TSnapshot,
  TScope = undefined
> {
  input: TInput
  previous: TSnapshot
  working: TWorking
  scope: TScope
}

export type PhaseEntry<
  TInput,
  TWorking,
  TSnapshot,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>,
  TPhaseChange,
  TPhaseMetrics
> = {
  [K in TPhaseName]: phase.Spec<
    K,
    Context<TInput, TWorking, TSnapshot, TScopeMap[K]>,
    TPhaseChange,
    TPhaseMetrics,
    TPhaseName,
    TScopeMap
  >
}[TPhaseName]

export interface Plan<
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
> {
  phases: ReadonlySet<TPhaseName>
  scope?: PhaseScopeInput<TPhaseName, TScopeMap>
}

export interface Planner<
  TInput,
  TSnapshot,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
> {
  plan(input: {
    input: TInput
    previous: TSnapshot
  }): Plan<TPhaseName, TScopeMap>
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
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
> {
  createWorking(): TWorking
  createSnapshot(): TSnapshot
  planner: Planner<TInput, TSnapshot, TPhaseName, TScopeMap>
  publisher: Publisher<TWorking, TSnapshot, TChange>
  phases: readonly PhaseEntry<
    TInput,
    TWorking,
    TSnapshot,
    TPhaseName,
    TScopeMap,
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

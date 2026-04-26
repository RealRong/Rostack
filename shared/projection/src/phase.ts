import type { Action } from './core'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeInput,
  PhaseScopeMap
} from './scope'

export interface Result<
  TMetrics = unknown,
  TPhaseName extends string = never,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
> {
  action: Action
  metrics?: TMetrics
  emit?: PhaseScopeInput<TPhaseName, TScopeMap>
}

export interface Spec<
  TName extends string,
  TContext,
  TMetrics = unknown,
  TPhaseName extends string = TName,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
> {
  name: TName
  deps: readonly TPhaseName[]
  scope?: TScopeMap[TName & TPhaseName]
  run(context: TContext): Result<TMetrics, TPhaseName, TScopeMap>
}

import type { Action } from './core'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeInput,
  PhaseScopeMap
} from './scope'

export interface Result<
  TChange = unknown,
  TMetrics = unknown,
  TPhaseName extends string = never,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
> {
  action: Action
  change: TChange
  metrics?: TMetrics
  emit?: PhaseScopeInput<TPhaseName, TScopeMap>
}

export interface Spec<
  TName extends string,
  TContext,
  TChange = unknown,
  TMetrics = unknown,
  TPhaseName extends string = TName,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
> {
  name: TName
  deps: readonly TPhaseName[]
  mergeScope?: (
    current: TScopeMap[TName & TPhaseName] | undefined,
    next: TScopeMap[TName & TPhaseName]
  ) => TScopeMap[TName & TPhaseName]
  run(context: TContext): Result<TChange, TMetrics, TPhaseName, TScopeMap>
}

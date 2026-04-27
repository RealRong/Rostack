import type { Action } from './core'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeInput,
  PhaseScopeMap,
  ScopeSchema
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
  TContext,
  TMetrics = unknown,
  TPhaseName extends string = string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>,
  TName extends TPhaseName = TPhaseName
> {
  after?: readonly TPhaseName[]
  scope?: TScopeMap[TName & TPhaseName] extends object
    ? ScopeSchema<NonNullable<TScopeMap[TName & TPhaseName]>>
    : undefined
  run(context: TContext): Result<TMetrics, TPhaseName, TScopeMap>
}

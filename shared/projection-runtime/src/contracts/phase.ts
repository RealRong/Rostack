import type { Action } from './core'

export interface Result<TChange = unknown, TMetrics = unknown> {
  action: Action
  change: TChange
  metrics?: TMetrics
}

export interface Spec<
  TName extends string,
  TContext,
  TChange = unknown,
  TMetrics = unknown
> {
  name: TName
  deps: readonly TName[]
  run(context: TContext): Result<TChange, TMetrics>
}

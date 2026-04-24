import type { Action, Revision } from './core'

export interface Phase<TName extends string = string, TMetrics = unknown> {
  name: TName
  action: Action
  changed: boolean
  durationMs: number
  metrics?: TMetrics
}

export interface Run<TName extends string = string, TMetrics = unknown> {
  revision: Revision
  phases: readonly Phase<TName, TMetrics>[]
  totalMs: number
}

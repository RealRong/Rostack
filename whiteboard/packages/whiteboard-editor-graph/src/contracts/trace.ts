import type { Action, Revision } from './core'
import type { Metrics, Name } from './phase'

export interface Phase {
  name: Name
  action: Action
  changed: boolean
  durationMs: number
  metrics?: Metrics
}

export interface Run {
  revision: Revision
  phases: readonly Phase[]
  totalMs: number
}

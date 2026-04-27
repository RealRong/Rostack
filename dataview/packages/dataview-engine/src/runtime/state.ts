import type { DataDoc } from '@dataview/core/types'
import type { IndexState } from '@dataview/engine/active/index/contracts'
import type { ViewPlan } from '@dataview/engine/active/plan'

export interface ActiveProjectionState {
  plan?: ViewPlan
  index: IndexState
}

export interface EngineState {
  rev: number
  doc: DataDoc
  active: ActiveProjectionState
}

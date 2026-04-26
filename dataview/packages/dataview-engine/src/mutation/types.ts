import type {
  ViewPlan
} from '@dataview/engine/active/plan'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  DataviewDelta
} from '@dataview/engine/contracts/delta'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export interface DataviewPublish {
  active?: ViewState
  delta?: DataviewDelta
}

export interface DataviewMutationCache {
  plan?: ViewPlan
  index: IndexState
}

import type {
  DataDoc
} from '@dataview/core/contracts'
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
  CommitTrace
} from '@dataview/engine/contracts/performance'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export interface DataviewPublishState {
  doc: DataDoc
  plan?: ViewPlan
  index: IndexState
  active?: ViewState
  delta?: DataviewDelta
  performanceTrace?: Omit<CommitTrace, 'id'>
}

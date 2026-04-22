import type { ViewCache } from '@dataview/engine/contracts/state'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  delta?: ActiveDelta
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

import type { ViewCache } from '@dataview/engine/contracts/state'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts'
import type {
  ViewRuntimeDelta as InternalViewRuntimeDelta
} from '@dataview/engine/contracts/state'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  delta?: InternalViewRuntimeDelta
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

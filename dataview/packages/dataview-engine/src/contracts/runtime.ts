import type { ViewCache } from '@dataview/engine/contracts/internal'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts/public'
import type {
  ViewRuntimeDelta as InternalViewRuntimeDelta
} from '@dataview/engine/contracts/internal'

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

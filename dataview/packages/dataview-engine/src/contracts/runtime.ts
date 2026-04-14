import type { ViewCache } from '@dataview/engine/contracts/internal'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts/public'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

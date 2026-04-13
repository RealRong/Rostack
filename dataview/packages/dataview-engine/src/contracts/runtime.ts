import type { ViewCache } from '#engine/contracts/internal'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '#engine/contracts/public'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

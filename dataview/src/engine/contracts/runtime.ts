import type { ViewCache } from './internal'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from './public'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

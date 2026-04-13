import type { ViewCache } from '#engine/contracts/internal.ts'
import type {
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '#engine/contracts/public.ts'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

import type { ViewCache } from '@dataview/engine/contracts/state'
import type {
  ActivePatch,
  SnapshotTrace,
  ViewState,
  ViewTrace
} from '@dataview/engine/contracts'
import type {
  SnapshotChange as InternalSnapshotChange
} from '@dataview/engine/contracts/state'

export interface ViewRuntimeResult {
  cache: ViewCache
  snapshot?: ViewState
  change?: InternalSnapshotChange
  patch?: ActivePatch
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

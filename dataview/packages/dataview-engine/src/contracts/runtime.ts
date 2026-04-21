import type { ViewCache } from '@dataview/engine/contracts/state'
import type {
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
  delta?: InternalSnapshotChange
  trace?: {
    view: ViewTrace
    snapshot: SnapshotTrace
    snapshotMs: number
  }
}

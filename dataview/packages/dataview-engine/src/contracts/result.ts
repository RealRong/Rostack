import type {
  DataDoc,
  View,
  ViewId
} from '@dataview/core/types'
import type { ViewState } from '@dataview/engine/contracts/view'

export interface DataviewCurrent {
  rev: number
  doc: DataDoc
  active?: ViewState
  docActiveViewId?: ViewId
  docActiveView?: View
}

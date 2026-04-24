import type {
  DataDoc
} from '@dataview/core/contracts'
import type {
  DataviewDelta
} from '@dataview/engine/contracts/delta'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

export interface DataviewPublish {
  active?: ViewState
  delta?: DataviewDelta
}

export interface DataviewCurrent {
  rev: number
  doc: DataDoc
  publish?: DataviewPublish
}

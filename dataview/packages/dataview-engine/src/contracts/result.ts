import type {
  DataDoc
} from '@dataview/core/contracts'
import type { DataviewPublish } from '@dataview/engine/mutation/types'

export interface DataviewCurrent {
  rev: number
  doc: DataDoc
  publish?: DataviewPublish
}

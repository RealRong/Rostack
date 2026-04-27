import type {
  DataDoc
} from '@dataview/core/types'
import type { DataviewPublish } from '@dataview/engine/mutation/types'

export interface DataviewCurrent {
  rev: number
  doc: DataDoc
  publish?: DataviewPublish
}

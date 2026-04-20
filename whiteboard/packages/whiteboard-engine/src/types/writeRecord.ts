import type { Operation, Origin } from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'

export type WriteRecord = {
  rev: number
  origin: Origin
  forward: readonly Operation[]
  inverse: readonly Operation[]
  history: {
    footprint: HistoryFootprint
  }
}

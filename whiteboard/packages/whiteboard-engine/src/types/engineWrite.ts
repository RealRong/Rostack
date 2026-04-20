import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  ChangeSet,
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'

export type EngineWrite = {
  rev: number
  at: number
  origin: Origin
  doc: Document
  changes: ChangeSet
  forward: readonly Operation[]
  inverse: readonly Operation[]
  footprint: HistoryFootprint
}

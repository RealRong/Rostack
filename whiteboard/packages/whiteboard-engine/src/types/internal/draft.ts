import type {
  ChangeSet,
  Document,
  Invalidation,
  Operation,
  Origin
} from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type { CommandFailure } from '@whiteboard/engine/types/result'

export type Draft<T = void> =
  | CommandFailure
  | {
      ok: true
      origin: Origin
      doc: Document
      ops: readonly Operation[]
      inverse: readonly Operation[]
      changes: ChangeSet
      invalidation: Invalidation
      history: {
        footprint: HistoryFootprint
      }
      value: T
    }

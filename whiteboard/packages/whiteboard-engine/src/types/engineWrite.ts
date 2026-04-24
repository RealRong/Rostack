import type { Write } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  ChangeSet,
  Document,
  Operation
} from '@whiteboard/core/types'

export type EngineWrite = Write<
  Document,
  Operation,
  HistoryFootprint[number],
  {
    changes: ChangeSet
  }
>

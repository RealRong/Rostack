import type {
  ApplyCommit,
  CommitRecord,
} from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import type {
  WhiteboardOperationReduceExtra
} from '@whiteboard/core/spec/operation'

export type EngineApplyCommit = ApplyCommit<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardOperationReduceExtra
>

export type EngineCommit = CommitRecord<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardOperationReduceExtra
>

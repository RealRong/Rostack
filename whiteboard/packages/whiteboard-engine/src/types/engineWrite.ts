import type { Write } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import type {
  WhiteboardReduceExtra
} from '@whiteboard/core/reducer'

export type EngineWrite = Write<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra
>

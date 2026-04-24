export {
  assertHistoryFootprint,
  createHistoryKeyCollector,
  historyFootprintConflicts,
  historyKeyConflicts,
  isHistoryKey,
  serializeHistoryKey
} from '@whiteboard/core/spec/history/key'

export type {
  HistoryFootprint,
  HistoryKeyCollector,
  HistoryKey
} from '@whiteboard/core/spec/history/key'

export {
  collect,
} from '@whiteboard/core/spec/history/collect'

export type {
  HistoryCollectContext,
  OperationHistoryCollector,
  OperationHistoryRegistry,
  WhiteboardHistoryRead
} from '@whiteboard/core/spec/history/collect'

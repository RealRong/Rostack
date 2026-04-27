import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type { WhiteboardOperationReduceExtra } from '@whiteboard/core/spec/operation'

export type WhiteboardMutationExtra = WhiteboardOperationReduceExtra

export type WhiteboardMutationKey =
  HistoryFootprint[number]

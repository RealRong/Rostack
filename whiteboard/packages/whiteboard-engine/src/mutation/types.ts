import type { HistoryFootprint } from '@whiteboard/core/operations'
import type { WhiteboardOperationReduceExtra } from '@whiteboard/core/operations'

export type WhiteboardMutationExtra = WhiteboardOperationReduceExtra

export type WhiteboardMutationKey =
  HistoryFootprint[number]

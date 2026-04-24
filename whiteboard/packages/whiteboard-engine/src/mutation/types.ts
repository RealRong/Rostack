import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type { WhiteboardReduceExtra } from '@whiteboard/core/reducer'

export type WhiteboardMutationExtra = WhiteboardReduceExtra

export type WhiteboardMutationKey =
  HistoryFootprint[number]

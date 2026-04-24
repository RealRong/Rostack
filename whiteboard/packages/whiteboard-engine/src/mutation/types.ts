import type { ChangeSet } from '@whiteboard/core/types'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'

export type WhiteboardMutationExtra = {
  changes: ChangeSet
}

export type WhiteboardMutationKey =
  HistoryFootprint[number]

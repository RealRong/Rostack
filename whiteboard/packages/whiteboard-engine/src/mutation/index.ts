import type {
  MutationDeltaOf
} from '@shared/mutation'
import {
  whiteboardMutationModel
} from '@whiteboard/core/mutation'

export type WhiteboardMutationDelta = MutationDeltaOf<
  typeof whiteboardMutationModel
>

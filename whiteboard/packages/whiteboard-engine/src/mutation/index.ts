import type {
  MutationDeltaOf
} from '@shared/mutation'
import {
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'

export type WhiteboardMutationDelta = MutationDeltaOf<
  typeof whiteboardMutationSchema
>

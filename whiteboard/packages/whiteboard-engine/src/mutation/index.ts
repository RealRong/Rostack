import type {
  MutationDelta
} from '@shared/mutation'
import {
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'

export type WhiteboardMutationDelta = MutationDelta<
  typeof whiteboardMutationSchema
>

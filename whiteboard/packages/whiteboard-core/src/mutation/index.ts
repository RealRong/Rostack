import {
  defineEntityMutationSchema
} from '@shared/mutation'
import {
  whiteboardEntities
} from '@whiteboard/core/operations/entities'

export const whiteboardMutationSchema = defineEntityMutationSchema({
  entities: whiteboardEntities,
  signals: {
    'canvas.order': {}
  }
} as const)

export type WhiteboardMutationSchema = typeof whiteboardMutationSchema

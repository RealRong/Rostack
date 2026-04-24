import { createGroupOrderMoveOps } from '@whiteboard/core/group/ops'

export const group = {
  op: {
    orderMove: createGroupOrderMoveOps
  }
} as const

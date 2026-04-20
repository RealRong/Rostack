import type { Engine } from '@whiteboard/engine'
import type { GroupWrite } from '@whiteboard/editor/write/types'

export const createGroupWrite = (
  engine: Engine
): GroupWrite => ({
  merge: (target) => engine.execute({
    type: 'group.merge',
    target
  }),
  order: {
    move: (ids, mode) => engine.execute({
      type: 'group.order.move',
      ids,
      mode
    })
  },
  ungroup: (ids) => engine.execute({
    type: 'group.ungroup',
    ids
  })
})

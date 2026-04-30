import type { Engine } from '@whiteboard/engine'
import type { GroupWrite } from '@whiteboard/editor/write/types'
import type { IntentResult } from '@whiteboard/engine/types/result'
import { planGroupOrderStep } from '@whiteboard/editor/write/orderStep'

export const createGroupWrite = (
  engine: Engine
): GroupWrite => ({
  merge: (target) => engine.execute({
    type: 'group.merge',
    target
  }),
  order: {
    move: (ids, to) => engine.execute({
      type: 'group.order.move',
      ids,
      to
    }),
    step: (ids, direction) => {
      const planned = planGroupOrderStep({
        document: engine.doc(),
        ids,
        direction
      })
      return (planned.length > 0
        ? engine.execute(planned as any)
        : engine.execute({
            type: 'group.order.move',
            ids: [],
            to: {
              kind: 'front'
            }
          })) as IntentResult
    }
  },
  ungroup: (ids) => engine.execute({
    type: 'group.ungroup',
    ids
  })
})

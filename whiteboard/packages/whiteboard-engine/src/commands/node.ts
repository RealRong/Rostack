import type {
  NodeBatchUpdate,
  NodeMoveInput,
  NodeUpdateManyOptions,
  WriteCommandMap
} from '@engine-types/command'
import type { EngineCommands } from '@engine-types/command'
import type { Apply } from '@engine-types/write'
import type {
  NodeAlignMode,
  NodeDistributeMode
} from '@whiteboard/core/node'
import type {
  EdgeId,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  Origin
} from '@whiteboard/core/types'

type NodeCommand = WriteCommandMap['node']

export const node = ({
  apply
}: {
  apply: Apply
}): EngineCommands['node'] => {
  const run = <C extends NodeCommand>(
    command: C,
    origin: Origin = 'user'
  ) =>
    apply({
      domain: 'node',
      command,
      origin
    })

  const create = (payload: NodeInput) =>
    run({ type: 'create', payload })

  const move = (input: NodeMoveInput) =>
    run({
      type: 'move',
      ids: input.ids,
      delta: input.delta
    })

  const update = (id: NodeId, update: NodeUpdateInput) =>
    run({
      type: 'updateMany',
      updates: [{ id, update }]
    })

  const updateMany = (
    updates: readonly NodeBatchUpdate[],
    options?: NodeUpdateManyOptions
  ) =>
    run({
      type: 'updateMany',
      updates
    }, options?.origin ?? 'user')

  const align = (
    ids: readonly NodeId[],
    mode: NodeAlignMode
  ) =>
    run({
      type: 'align',
      ids,
      mode
    })

  const distribute = (
    ids: readonly NodeId[],
    mode: NodeDistributeMode
  ) =>
    run({
      type: 'distribute',
      ids,
      mode
    })

  const remove = (ids: NodeId[]) =>
    run({ type: 'delete', ids })

  const deleteCascade = (ids: NodeId[]) =>
    run({ type: 'deleteCascade', ids })

  const duplicate = (ids: NodeId[]) =>
    run({ type: 'duplicate', ids })

  const createGroup = (target: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) =>
    run({ type: 'group.create', target })

  const ungroup = (id: NodeId) =>
    run({ type: 'group.ungroup', id })

  const ungroupMany = (ids: NodeId[]) =>
    run({ type: 'group.ungroupMany', ids })

  const order = {
    set: (ids: NodeId[]) => run({ type: 'order', mode: 'set', ids }),
    bringToFront: (ids: NodeId[]) => run({ type: 'order', mode: 'front', ids }),
    sendToBack: (ids: NodeId[]) => run({ type: 'order', mode: 'back', ids }),
    bringForward: (ids: NodeId[]) => run({ type: 'order', mode: 'forward', ids }),
    sendBackward: (ids: NodeId[]) => run({ type: 'order', mode: 'backward', ids })
  }

  return {
    create,
    move,
    update,
    updateMany,
    align,
    distribute,
    delete: remove,
    deleteCascade,
    duplicate,
    group: {
      create: createGroup,
      ungroup,
      ungroupMany
    },
    order
  }
}

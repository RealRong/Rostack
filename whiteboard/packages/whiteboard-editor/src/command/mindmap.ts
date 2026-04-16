import type { Engine } from '@whiteboard/engine'
import {
  planMindmapInsertByPlacement,
  planMindmapRootMove,
  planMindmapSubtreeMove
} from '@whiteboard/core/mindmap'
import type { NodeId } from '@whiteboard/core/types'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { MindmapCommands } from '@whiteboard/editor/types/commands'
import type { NodeCommands } from '@whiteboard/editor/command/node/types'

type MindmapExecute = Engine['execute']

const readNodePosition = ({
  read,
  nodeId
}: {
  read: EditorQueryRead
  nodeId: NodeId
}) => read.node.item.get(nodeId)?.node.position

const createMindmapCoreCommands = (
  execute: MindmapExecute
): Pick<
  MindmapCommands,
  'create' | 'delete' | 'patch' | 'insert' | 'moveSubtree' | 'removeSubtree' | 'cloneSubtree'
> => ({
  create: (payload) => execute({
    type: 'mindmap.create',
    payload
  }),
  delete: (ids) => execute({
    type: 'mindmap.delete',
    ids
  }),
  patch: (id, input) => execute({
    type: 'mindmap.patch',
    id,
    input
  }),
  insert: (id, input) => execute({
    type: 'mindmap.insert',
    id,
    input
  }),
  moveSubtree: (id, input) => execute({
    type: 'mindmap.move',
    id,
    input
  }),
  removeSubtree: (id, input) => execute({
    type: 'mindmap.remove',
    id,
    input
  }),
  cloneSubtree: (id, input) => execute({
    type: 'mindmap.clone',
    id,
    input
  })
})

export const createMindmapCommands = ({
  execute,
  read,
  node
}: {
  execute: MindmapExecute
  read: EditorQueryRead
  node: Pick<NodeCommands, 'update'>
}): MindmapCommands => {
  const commands = createMindmapCoreCommands(execute)

  return {
    ...commands,
    insertByPlacement: (input) => commands.insert(
      input.id,
      planMindmapInsertByPlacement(input)
    ),
    moveByDrop: (input) => {
      const command = planMindmapSubtreeMove(input)

      return command
        ? commands.moveSubtree(input.id, command)
        : undefined
    },
    moveRoot: (input) => {
      const update = planMindmapRootMove({
        position: input.position,
        origin: input.origin ?? readNodePosition({
          read,
          nodeId: input.nodeId
        }),
        threshold: input.threshold
      })

      return update
        ? node.update(input.nodeId, update)
        : undefined
    }
  }
}

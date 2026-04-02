import type { Apply } from '@engine-types/write'
import type { EngineCommands, WriteCommandMap } from '@engine-types/command'
import type { Origin } from '@whiteboard/core/types'

type MindmapCommand = WriteCommandMap['mindmap']

export const mindmap = ({
  apply
}: {
  apply: Apply
}): EngineCommands['mindmap'] => {
  const run = <C extends MindmapCommand>(
    command: C,
    origin: Origin = 'user'
  ) =>
    apply({
      domain: 'mindmap',
      command,
      origin
    })

  return {
    create: (payload) =>
      run({
        type: 'create',
        payload
      }),
    delete: (ids) =>
      run({
        type: 'delete',
        ids
      }),
    insert: (id, input) =>
      run({
        type: 'insert',
        id,
        input
      }),
    moveSubtree: (id, input) =>
      run({
        type: 'move.subtree',
        id,
        input
      }),
    removeSubtree: (id, input) =>
      run({
        type: 'remove',
        id,
        input
      }),
    cloneSubtree: (id, input) =>
      run({
        type: 'clone.subtree',
        id,
        input
      }),
    updateNode: (id, input) =>
      run({
        type: 'update.node',
        id,
        input
      })
  }
}

import type {
  GroupWriteCommand
} from '@engine-types/command'
import type { EngineCommands } from '@engine-types/command'
import type { Apply } from '@engine-types/write'
import type {
  EdgeId,
  GroupId,
  NodeId,
  Origin
} from '@whiteboard/core/types'

type GroupCommand = GroupWriteCommand

export const group = ({
  apply
}: {
  apply: Apply
}): EngineCommands['group'] => {
  const run = <C extends GroupCommand>(
    command: C,
    origin: Origin = 'user'
  ) =>
    apply({
      domain: 'group',
      command,
      origin
    })

  const merge = (target: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) =>
    run({ type: 'merge', target })

  const order = {
    set: (ids: GroupId[]) => run({ type: 'order', mode: 'set', ids }),
    bringToFront: (ids: GroupId[]) => run({ type: 'order', mode: 'front', ids }),
    sendToBack: (ids: GroupId[]) => run({ type: 'order', mode: 'back', ids }),
    bringForward: (ids: GroupId[]) => run({ type: 'order', mode: 'forward', ids }),
    sendBackward: (ids: GroupId[]) => run({ type: 'order', mode: 'backward', ids })
  }

  const ungroup = (id: GroupId) =>
    run({ type: 'ungroup', id })

  const ungroupMany = (ids: GroupId[]) =>
    run({ type: 'ungroupMany', ids })

  return {
    merge,
    order,
    ungroup,
    ungroupMany
  }
}

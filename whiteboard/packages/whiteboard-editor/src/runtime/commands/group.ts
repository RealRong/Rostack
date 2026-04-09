import {
  normalizeSelectionTarget
} from '@whiteboard/core/selection'
import type { EngineCommands } from '@whiteboard/engine'
import type {
  EditorCanvasOrderMode,
  EditorGroupsActions,
  EditorRead
} from '../../types/editor'
import {
  readGroupTarget
} from './target'

type GroupActionHost = {
  read: Pick<EditorRead, 'group'>
  commands: {
    group: Pick<EngineCommands['group'], 'merge' | 'order' | 'ungroup' | 'ungroupMany'>
    selection: {
      replace: (input: {
        nodeIds?: readonly string[]
        edgeIds?: readonly string[]
      }) => void
      clear: () => void
    }
  }
}

const orderGroups = (
  order: EngineCommands['group']['order'],
  groupIds: readonly string[],
  mode: EditorCanvasOrderMode
) => {
  const ids = [...groupIds]
  if (mode === 'front') {
    return order.bringToFront(ids)
  }
  if (mode === 'forward') {
    return order.bringForward(ids)
  }
  if (mode === 'backward') {
    return order.sendBackward(ids)
  }

  return order.sendToBack(ids)
}

export const createGroupsActions = ({
  read,
  commands
}: GroupActionHost): EditorGroupsActions => ({
  merge: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const result = commands.group.merge(target)
    if (!result.ok) {
      return false
    }

    if (options?.selectResult === false) {
      return true
    }

    const selection = readGroupTarget(read, result.data.groupId)
    commands.selection.replace(selection ?? target)
    return true
  },
  ungroup: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const groupIds = [...read.group.exactIds(target)]
    if (!groupIds.length) {
      return false
    }

    const result = groupIds.length === 1
      ? commands.group.ungroup(groupIds[0]!)
      : commands.group.ungroupMany(groupIds)
    if (!result.ok) {
      return false
    }

    if (options?.fallbackSelection === 'none') {
      commands.selection.clear()
      return true
    }

    commands.selection.replace({
      nodeIds: result.data.nodeIds,
      edgeIds: result.data.edgeIds
    })
    return true
  },
  order: (groupIds, mode) => {
    if (!groupIds.length) {
      return false
    }

    return orderGroups(commands.group.order, groupIds, mode).ok
  }
})

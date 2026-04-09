import {
  normalizeSelectionTarget
} from '@whiteboard/core/selection'
import type { CommandResult } from '@engine-types/result'
import type {
  OrderMode,
  GroupActions
} from '../editor/runtimeTypes'
import type { EditorRead } from '../../types/editor'
import {
  readGroupTarget
} from './target'

type GroupActionHost = {
  read: Pick<EditorRead, 'group'>
  commands: {
    group: {
      merge: (target: {
        nodeIds?: readonly string[]
        edgeIds?: readonly string[]
      }) => CommandResult<{ groupId: string }>
      order: {
        bringToFront: (ids: string[]) => CommandResult
        sendToBack: (ids: string[]) => CommandResult
        bringForward: (ids: string[]) => CommandResult
        sendBackward: (ids: string[]) => CommandResult
      }
      ungroup: (id: string) => CommandResult<{
        nodeIds: readonly string[]
        edgeIds: readonly string[]
      }>
      ungroupMany: (ids: string[]) => CommandResult<{
        nodeIds: readonly string[]
        edgeIds: readonly string[]
      }>
    }
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
  order: GroupActionHost['commands']['group']['order'],
  groupIds: readonly string[],
  mode: OrderMode
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
}: GroupActionHost): GroupActions => ({
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

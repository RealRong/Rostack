import {
  normalizeSelectionTarget
} from '@whiteboard/core/selection'
import type {
  Editor,
  EditorGroupCommands,
  EditorRead
} from '../../types/editor'
import {
  readGroupTarget
} from './target'

type GroupCommandHost = {
  read: Pick<EditorRead, 'group'>
  commands: {
    group: Pick<Editor['write']['document']['group'], 'merge' | 'order' | 'ungroup' | 'ungroupMany'>
    selection: Editor['commands']['selection']
  }
}

export const createGroupCommands = ({
  read,
  commands
}: GroupCommandHost): EditorGroupCommands => ({
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
  order: commands.group.order
})

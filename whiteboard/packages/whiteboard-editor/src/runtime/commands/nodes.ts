import {
  normalizeSelectionTarget,
  type SelectionInput
} from '@whiteboard/core/selection'
import type { EngineCommands } from '@whiteboard/engine'
import type {
  Editor,
  EditorNodesCommands,
  EditorNodesOrderMode,
  EditorRead
} from '../../types/editor'
import {
  resolveInsertedSelection,
  toCanvasRefs
} from './target'

type NodesCommandHost = {
  read: Pick<EditorRead, 'group'>
  commands: {
    canvas: EngineCommands['canvas']
    group: Pick<Editor['commands']['group'], 'order'>
    selection: Editor['commands']['selection']
  }
}

const orderTarget = (
  commands: NodesCommandHost['commands'],
  refs: ReturnType<typeof toCanvasRefs>,
  mode: EditorNodesOrderMode
) => {
  if (mode === 'front') {
    return commands.canvas.order.bringToFront(refs)
  }
  if (mode === 'forward') {
    return commands.canvas.order.bringForward(refs)
  }
  if (mode === 'backward') {
    return commands.canvas.order.sendBackward(refs)
  }

  return commands.canvas.order.sendToBack(refs)
}

const orderGroups = (
  commands: NodesCommandHost['commands'],
  groupIds: readonly string[],
  mode: EditorNodesOrderMode
) => {
  const ids = [...groupIds]
  if (mode === 'front') {
    return commands.group.order.bringToFront(ids)
  }
  if (mode === 'forward') {
    return commands.group.order.bringForward(ids)
  }
  if (mode === 'backward') {
    return commands.group.order.sendBackward(ids)
  }

  return commands.group.order.sendToBack(ids)
}

export const createNodesCommands = ({
  read,
  commands
}: NodesCommandHost): EditorNodesCommands => ({
  duplicate: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = commands.canvas.duplicate(refs)
    if (!result.ok) {
      return false
    }

    if (options?.selectInserted !== false) {
      commands.selection.replace(resolveInsertedSelection(result.data))
    }

    return true
  },
  delete: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = commands.canvas.delete(refs)
    if (!result.ok) {
      return false
    }

    if (options?.clearSelection !== false) {
      commands.selection.clear()
    }

    return true
  },
  order: (input, mode) => {
    const target = normalizeSelectionTarget(input)
    const groupIds = read.group.exactIds(target)
    if (groupIds.length > 0) {
      return orderGroups(commands, groupIds, mode).ok
    }

    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    return orderTarget(commands, refs, mode).ok
  }
})

import {
  normalizeSelectionTarget,
  type SelectionInput
} from '@whiteboard/core/selection'
import type { CommandResult } from '@engine-types/result'
import type { CanvasItemRef } from '@whiteboard/core/types'
import type {
  EditorCanvasActions,
  EditorCanvasOrderMode,
  EditorRead
} from '../../types/editor'
import {
  resolveInsertedSelection,
  toCanvasRefs
} from './target'

type CanvasActionHost = {
  read: Pick<EditorRead, 'group'>
  commands: {
    canvas: {
      delete: (refs: CanvasItemRef[]) => CommandResult
      duplicate: (refs: CanvasItemRef[]) => CommandResult<any>
      order: {
        bringToFront: (refs: CanvasItemRef[]) => CommandResult
        sendToBack: (refs: CanvasItemRef[]) => CommandResult
        bringForward: (refs: CanvasItemRef[]) => CommandResult
        sendBackward: (refs: CanvasItemRef[]) => CommandResult
      }
    }
    group: {
      bringToFront: (ids: string[]) => CommandResult
      sendToBack: (ids: string[]) => CommandResult
      bringForward: (ids: string[]) => CommandResult
      sendBackward: (ids: string[]) => CommandResult
    }
    selection: {
      replace: (input: SelectionInput) => void
      clear: () => void
    }
  }
}

const orderTarget = (
  commands: CanvasActionHost['commands'],
  refs: ReturnType<typeof toCanvasRefs>,
  mode: EditorCanvasOrderMode
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
  commands: CanvasActionHost['commands'],
  groupIds: readonly string[],
  mode: EditorCanvasOrderMode
) => {
  const ids = [...groupIds]
  if (mode === 'front') {
    return commands.group.bringToFront(ids)
  }
  if (mode === 'forward') {
    return commands.group.bringForward(ids)
  }
  if (mode === 'backward') {
    return commands.group.sendBackward(ids)
  }

  return commands.group.sendToBack(ids)
}

export const createCanvasActions = ({
  read,
  commands
}: CanvasActionHost): EditorCanvasActions => ({
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

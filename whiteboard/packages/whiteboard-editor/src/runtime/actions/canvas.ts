import {
  normalizeSelectionTarget,
  type SelectionInput
} from '@whiteboard/core/selection'
import type { CommandResult } from '@engine-types/result'
import type { CanvasItemRef } from '@whiteboard/core/types'
import type {
  CanvasActions,
  CanvasOrderMode
} from '../../internal/types'
import type { EditorRead } from '../../types/editor'
import {
  resolveInsertedSelection,
  toCanvasRefs
} from './target'

type CanvasActionHost = {
  read: Pick<EditorRead, 'group'>
  commands: {
    document: {
      delete: (refs: CanvasItemRef[]) => CommandResult
      duplicate: (refs: CanvasItemRef[]) => CommandResult<any>
      order: (refs: CanvasItemRef[], mode: CanvasOrderMode) => CommandResult
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
  mode: CanvasOrderMode
) => commands.document.order(refs, mode)

const orderGroups = (
  commands: CanvasActionHost['commands'],
  groupIds: readonly string[],
  mode: CanvasOrderMode
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
}: CanvasActionHost): CanvasActions => ({
  duplicate: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = commands.document.duplicate(refs)
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

    const result = commands.document.delete(refs)
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

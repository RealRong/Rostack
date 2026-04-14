import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { SessionActions } from '@whiteboard/editor/types/commands'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EditorLocalState } from '@whiteboard/editor/local/runtime'

export type LocalSessionActions = Pick<SessionActions, 'tool' | 'selection'>

const isSameTool = (
  left: Tool,
  right: Tool
) => {
  if (left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case 'edge':
      return right.type === 'edge' && left.preset === right.preset
    case 'insert':
      return right.type === 'insert' && left.preset === right.preset
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

export const createLocalSessionActions = ({
  state,
  getRead
}: {
  state: Pick<EditorLocalState, 'tool' | 'selection' | 'edit'>
  getRead: () => Pick<EditorQueryRead, 'node' | 'edge'> | null
}): LocalSessionActions => {
  const clearSessionState = () => {
    state.edit.mutate.clear()
    state.selection.mutate.clear()
  }

  const writeSelection = (
    apply: () => boolean
  ) => {
    if (!apply()) {
      return
    }

    state.edit.mutate.clear()
  }

  return {
    tool: {
      set: (nextTool) => {
        const currentTool = state.tool.get()
        const toolChanged = !isSameTool(currentTool, nextTool)

        if (toolChanged || nextTool.type === 'draw') {
          clearSessionState()
        }

        if (!toolChanged) {
          return
        }

        state.tool.set(nextTool)
      }
    },
    selection: {
      replace: (input) => {
        writeSelection(() => state.selection.mutate.replace(input))
      },
      add: (input) => {
        writeSelection(() => state.selection.mutate.apply('add', input))
      },
      remove: (input) => {
        writeSelection(() => state.selection.mutate.apply('subtract', input))
      },
      toggle: (input) => {
        writeSelection(() => state.selection.mutate.apply('toggle', input))
      },
      selectAll: () => {
        const read = getRead()
        if (!read) {
          return
        }

        writeSelection(() => state.selection.mutate.selectAll(read))
      },
      clear: () => {
        writeSelection(() => state.selection.mutate.clear())
      }
    }
  }
}

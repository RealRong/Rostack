import type {
  ShortcutAction,
  ShortcutBinding
} from '../types/common/shortcut'
import { selectTool } from '@whiteboard/editor'
import type { WhiteboardRuntime as Editor } from '#react/types/runtime'

export const DefaultShortcutBindings: readonly ShortcutBinding[] = [
  { key: 'Mod+G', action: 'group.merge' },
  { key: 'Shift+Mod+G', action: 'group.ungroup' },
  { key: 'Mod+A', action: 'selection.selectAll' },
  { key: 'Escape', action: 'selection.clear' },
  { key: 'Backspace', action: 'selection.delete' },
  { key: 'Delete', action: 'selection.delete' },
  { key: 'Mod+D', action: 'selection.duplicate' },
  { key: 'Mod+Z', action: 'history.undo' },
  { key: 'Shift+Mod+Z', action: 'history.redo' },
  { key: 'Mod+Y', action: 'history.redo' }
] as const

type ShortcutState = ReturnType<typeof readShortcutState>

const readShortcutState = (
  editor: Editor
) => {
  const selection = editor.state.selection.get()
  const count = selection.nodeIds.length + selection.edgeIds.length

  return {
    selection,
    hasSelection: count > 0,
    canGroup: count >= 2,
    canUngroup: editor.read.group.exactIds(selection).length > 0,
    canDuplicate: count > 0
  }
}

const canRunShortcut = (
  editor: Editor,
  action: ShortcutAction,
  state: ShortcutState
) => {
  switch (action) {
    case 'group.merge':
      return state.canGroup
    case 'group.ungroup':
      return state.canUngroup
    case 'selection.selectAll':
      return true
    case 'selection.clear':
      return state.hasSelection || !editor.read.tool.is('select')
    case 'selection.delete':
      return state.hasSelection
    case 'selection.duplicate':
      return state.canDuplicate
    case 'history.undo':
    case 'history.redo':
      return true
    default:
      return false
  }
}

export const runShortcut = (
  editor: Editor,
  action: ShortcutAction
) => {
  const state = readShortcutState(editor)
  if (!canRunShortcut(editor, action, state)) {
    return false
  }

  const { selection } = state

  switch (action) {
    case 'selection.selectAll':
      editor.actions.session.selection.selectAll()
      return true
    case 'selection.clear':
      if (!editor.read.tool.is('select')) {
        editor.actions.session.tool.set(selectTool())
      }
      editor.actions.session.selection.clear()
      return true
    case 'selection.delete':
      return editor.actions.document.canvas.delete({
        nodeIds: selection.nodeIds,
        edgeIds: selection.edgeIds
      })
    case 'selection.duplicate': {
      return editor.actions.document.canvas.duplicate({
        nodeIds: selection.nodeIds,
        edgeIds: selection.edgeIds
      })
    }
    case 'group.merge': {
      return editor.actions.document.groups.merge({
        nodeIds: selection.nodeIds,
        edgeIds: selection.edgeIds
      })
    }
    case 'group.ungroup': {
      return editor.actions.document.groups.ungroup({
        nodeIds: selection.nodeIds,
        edgeIds: selection.edgeIds
      })
    }
    case 'history.undo':
      return editor.actions.document.history.undo().ok
    case 'history.redo':
      return editor.actions.document.history.redo().ok
    default:
      return false
  }
}

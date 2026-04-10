import type {
  ShortcutAction,
  ShortcutBinding
} from '../types/common/shortcut'
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
  const selection = editor.select.selection().get()
  const count = selection.nodeIds.length + selection.edgeIds.length

  return {
    selection,
    hasSelection: count > 0,
    canGroup: count >= 2,
    canUngroup: editor.select.group.exactIds(selection).length > 0,
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
      return state.hasSelection || !editor.select.tool.is('select')
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
      editor.actions.selection.all()
      return true
    case 'selection.clear':
      if (!editor.select.tool.is('select')) {
        editor.actions.tool.select()
      }
      editor.actions.selection.clear()
      return true
    case 'selection.delete':
      return editor.actions.selection.delete()
    case 'selection.duplicate': {
      return editor.actions.selection.duplicate()
    }
    case 'group.merge': {
      return editor.actions.selection.group()
    }
    case 'group.ungroup': {
      return editor.actions.selection.ungroup()
    }
    case 'history.undo':
      return editor.actions.history.undo().ok
    case 'history.redo':
      return editor.actions.history.redo().ok
    default:
      return false
  }
}

import type {
  ShortcutAction,
  ShortcutBinding
} from '@whiteboard/react/types/common/shortcut'
import type { WhiteboardRuntime as Editor } from '@whiteboard/react/types/runtime'
import {
  readSelectionCan
} from '@whiteboard/react/features/selection/capability'

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
  const selection = editor.store.selection.get()
  const count = selection.nodeIds.length + selection.edgeIds.length

  return {
    selection,
    hasSelection: count > 0,
    canGroup: readSelectionCan({
      editor,
      target: selection
    }).makeGroup,
    canUngroup: readSelectionCan({
      editor,
      target: selection
    }).ungroup,
    canDelete: readSelectionCan({
      editor,
      target: selection
    }).delete,
    canDuplicate: readSelectionCan({
      editor,
      target: selection
    }).duplicate
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
      return state.hasSelection && state.canDelete
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
      editor.actions.selection.selectAll()
      return true
    case 'selection.clear':
      if (!editor.read.tool.is('select')) {
        editor.actions.tool.select()
      }
      editor.actions.selection.clear()
      return true
    case 'selection.delete':
      return editor.actions.selection.delete(selection)
    case 'selection.duplicate': {
      return editor.actions.selection.duplicate(selection)
    }
    case 'group.merge': {
      return editor.actions.selection.group(selection)
    }
    case 'group.ungroup': {
      return editor.actions.selection.ungroup(selection)
    }
    case 'history.undo':
      return editor.actions.history.undo().ok
    case 'history.redo':
      return editor.actions.history.redo().ok
    default:
      return false
  }
}

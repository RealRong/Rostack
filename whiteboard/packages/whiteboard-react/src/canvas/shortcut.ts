import type {
  ShortcutAction,
  ShortcutBinding
} from '../types/common/shortcut'
import { selectTool } from '@whiteboard/editor'
import type { WhiteboardRuntime as Editor } from '../types/runtime'
import {
  duplicateNodesAndSelect,
  groupNodesAndSelect,
  ungroupNodesAndSelect
} from '../runtime/commands'

export const DefaultShortcutBindings: readonly ShortcutBinding[] = [
  { key: 'Mod+G', action: 'group.create' },
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
  const selection = editor.read.selection.summary.get()

  return {
    selection,
    pureNode: selection.items.edgeCount === 0,
    hasSelection: selection.items.count > 0,
    canGroup: selection.items.edgeCount === 0 && selection.target.nodeIds.length >= 2,
    canUngroup: selection.items.edgeCount === 0 && selection.items.nodes.some((node) => node.type === 'group'),
    canDuplicate: selection.items.edgeCount === 0 && selection.items.nodeCount > 0
  }
}

const canRunShortcut = (
  editor: Editor,
  action: ShortcutAction,
  state: ShortcutState
) => {
  switch (action) {
    case 'group.create':
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
      editor.commands.selection.selectAll()
      return true
    case 'selection.clear':
      if (!editor.read.tool.is('select')) {
        editor.commands.tool.set(selectTool())
      }
      editor.commands.selection.clear()
      return true
    case 'selection.delete':
      if (selection.target.edgeIds.length > 0) {
        const result = editor.commands.edge.delete([...selection.target.edgeIds])
        if (!result.ok) {
          return false
        }
      }

      if (selection.target.nodeIds.length > 0) {
        const result = editor.commands.node.deleteCascade([...selection.target.nodeIds])
        if (!result.ok) {
          return false
        }
      }

      return true
    case 'selection.duplicate': {
      return duplicateNodesAndSelect(editor, selection.target.nodeIds)
    }
    case 'group.create': {
      return groupNodesAndSelect(editor, selection.target.nodeIds)
    }
    case 'group.ungroup': {
      const groupIds = selection.target.nodeIds.filter((nodeId) =>
        selection.items.nodes.some((node) => node.id === nodeId && node.type === 'group')
      )
      return ungroupNodesAndSelect(editor, groupIds)
    }
    case 'history.undo':
      return editor.commands.history.undo().ok
    case 'history.redo':
      return editor.commands.history.redo().ok
    default:
      return false
  }
}

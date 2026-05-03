import type {
  ShortcutAction,
  ShortcutBinding
} from '@whiteboard/react/types/common/shortcut'
import type { WhiteboardRuntime as Editor } from '@whiteboard/react/types/runtime'
import {
  readSelectionCan
} from '@whiteboard/react/features/selection/capability'
import { readMindmapNavigateTarget } from '@whiteboard/core/mindmap/tree'

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
  { key: 'Mod+Y', action: 'history.redo' },
  { key: 'ArrowLeft', action: 'mindmap.navigate.parent' },
  { key: 'ArrowRight', action: 'mindmap.navigate.first-child' },
  { key: 'ArrowUp', action: 'mindmap.navigate.prev-sibling' },
  { key: 'ArrowDown', action: 'mindmap.navigate.next-sibling' },
  { key: 'Tab', action: 'mindmap.insert.child' },
  { key: 'Enter', action: 'mindmap.insert.sibling' },
  { key: 'Shift+Tab', action: 'mindmap.insert.parent' }
] as const

type ShortcutState = ReturnType<typeof readShortcutState>

type ActiveMindmapShortcut = {
  treeId: string
  nodeId: string
}

const DEFAULT_SHORTCUT_INSERT_BEHAVIOR = {
  focus: 'keep-current',
  enter: 'from-anchor'
} as const

const readActiveMindmapShortcut = (
  editor: Editor
): ActiveMindmapShortcut | undefined => {
  const selection = editor.scene.ui.state.selection.get()
  if (
    editor.scene.ui.state.edit.get() !== null
    || selection.edgeIds.length > 0
    || selection.nodeIds.length !== 1
  ) {
    return undefined
  }

  const node = editor.scene.stores.render.node.byId.get(selection.nodeIds[0] ?? '')?.node
  if (node?.owner?.kind !== 'mindmap' || node.type !== 'text') {
    return undefined
  }

  return {
    treeId: node.owner.id,
    nodeId: node.id
  }
}

const readShortcutState = (
  editor: Editor
) => {
  const selection = editor.scene.ui.state.selection.get()
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
    }).duplicate,
    mindmap: readActiveMindmapShortcut(editor)
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
      return state.hasSelection || !editor.scene.ui.state.tool.is('select')
    case 'selection.delete':
      return state.hasSelection && state.canDelete
    case 'selection.duplicate':
      return state.canDuplicate
    case 'history.undo':
    case 'history.redo':
      return true
    case 'mindmap.navigate.parent':
    case 'mindmap.navigate.first-child':
    case 'mindmap.navigate.prev-sibling':
    case 'mindmap.navigate.next-sibling':
    case 'mindmap.insert.child':
    case 'mindmap.insert.sibling':
    case 'mindmap.insert.parent':
      return Boolean(state.mindmap)
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
  const activeMindmap = state.mindmap

  switch (action) {
    case 'selection.selectAll':
      editor.actions.session.selection.selectAll()
      return true
    case 'selection.clear':
      if (!editor.scene.ui.state.tool.is('select')) {
        editor.actions.session.tool.select()
      }
      editor.actions.session.selection.clear()
      return true
    case 'selection.delete':
      return editor.actions.session.selection.delete(selection)
    case 'selection.duplicate': {
      return editor.actions.session.selection.duplicate(selection)
    }
    case 'group.merge': {
      return editor.actions.session.selection.group(selection)
    }
    case 'group.ungroup': {
      return editor.actions.session.selection.ungroup(selection)
    }
    case 'history.undo':
      return editor.actions.document.history.undo().ok
    case 'history.redo':
      return editor.actions.document.history.redo().ok
    case 'mindmap.navigate.parent':
    case 'mindmap.navigate.first-child':
    case 'mindmap.navigate.prev-sibling':
    case 'mindmap.navigate.next-sibling': {
      if (!activeMindmap) {
        return false
      }

      const structure = editor.scene.mindmaps.structure(activeMindmap.treeId)
      const target = structure
        ? readMindmapNavigateTarget({
            tree: structure.tree,
            fromNodeId: activeMindmap.nodeId,
            direction: action === 'mindmap.navigate.parent'
              ? 'parent'
              : action === 'mindmap.navigate.first-child'
                ? 'first-child'
                : action === 'mindmap.navigate.prev-sibling'
                  ? 'prev-sibling'
                  : 'next-sibling'
          })
        : undefined
      if (!target) {
        return false
      }

      editor.actions.session.selection.replace({
        nodeIds: [target]
      })
      return true
    }
    case 'mindmap.insert.child':
    case 'mindmap.insert.sibling':
    case 'mindmap.insert.parent': {
      if (!activeMindmap) {
        return false
      }

      return Boolean(editor.actions.document.mindmap.insertRelative({
        id: activeMindmap.treeId,
        targetNodeId: activeMindmap.nodeId,
        relation: action === 'mindmap.insert.child'
          ? 'child'
          : action === 'mindmap.insert.sibling'
            ? 'sibling'
            : 'parent',
        payload: {
          kind: 'text',
          text: ''
        },
        behavior: DEFAULT_SHORTCUT_INSERT_BEHAVIOR
      })?.ok)
    }
    default:
      return false
  }
}

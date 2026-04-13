import { createValueStore, type ValueStore } from '@shared/core'
import type { Tool } from '../types/tool'
import type { EditorRead, EditorState } from '../types/editor'
import type { PointerSample } from '../types/input'
import type { DrawState } from '../model/draw/state'
import { createEditState, type EditState } from './edit'
import {
  createDrawStateStore,
  type DrawStateStore
} from './draw'
import {
  createSelectionState,
  type SelectionState
} from './selection'

type ReadNodeEdge = Pick<EditorRead, 'node' | 'edge'>

export type EditorLocalState = {
  tool: ValueStore<Tool>
  draw: DrawStateStore
  selection: SelectionState
  edit: EditState
  pointer: ValueStore<PointerSample | null>
  space: ValueStore<boolean>
}

export type EditorStateController = {
  state: EditorLocalState
  public: {
    state: Pick<EditorState, 'tool' | 'draw' | 'edit' | 'selection'>
  }
  resetLocal: () => void
  reconcileAfterCommit: (read: ReadNodeEdge) => void
}

export const createEditorStateController = ({
  initialTool,
  initialDrawState
}: {
  initialTool: Tool
  initialDrawState: DrawState
}): EditorStateController => {
  const tool = createValueStore<Tool>(initialTool)
  const draw = createDrawStateStore(initialDrawState)
  const selection = createSelectionState()
  const edit = createEditState()
  const pointer = createValueStore<PointerSample | null>(null)
  const space = createValueStore(false)

  const publicState: Pick<EditorState, 'tool' | 'draw' | 'edit' | 'selection'> = {
    tool,
    draw: draw.store,
    edit: edit.source,
    selection: selection.source
  }

  return {
    state: {
      tool,
      draw,
      selection,
      edit,
      pointer,
      space
    },
    public: {
      state: publicState
    },
    resetLocal: () => {
      pointer.set(null)
      space.set(false)
      edit.mutate.clear()
      selection.mutate.clear()
    },
    reconcileAfterCommit: (read) => {
      selection.mutate.reconcile(read)

      const currentEdit = edit.source.get()
      if (
        currentEdit
        && (
          (currentEdit.kind === 'node' && !read.node.item.get(currentEdit.nodeId))
          || (currentEdit.kind === 'edge-label' && !read.edge.item.get(currentEdit.edgeId))
        )
      ) {
        edit.mutate.clear()
      }
    }
  }
}

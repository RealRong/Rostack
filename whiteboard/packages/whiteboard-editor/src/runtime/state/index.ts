import { createValueStore, type ValueStore } from '@shared/store'
import { isOrderedArrayEqual } from '@whiteboard/core/equality'
import type { Tool } from '../../types/tool'
import type { EditorRead, EditorState } from '../../types/editor'
import type { PointerSample } from '../../types/input'
import type { DrawPreferences } from '../../types/draw'
import { createEditState, type EditState } from './edit'
import {
  createDrawPreferencesState,
  type DrawPreferencesState
} from './draw'
import {
  createSelectionState,
  type SelectionState
} from './selection'

type ReadNodeEdge = Pick<EditorRead, 'node' | 'edge'>

const uniqueNodeIds = (
  nodeIds: readonly string[]
) => {
  const seen = new Set<string>()
  const next: string[] = []

  nodeIds.forEach((nodeId) => {
    if (seen.has(nodeId)) {
      return
    }
    seen.add(nodeId)
    next.push(nodeId)
  })

  return next
}

const uniqueEdgeIds = (
  edgeIds: readonly string[]
) => {
  const seen = new Set<string>()
  const next: string[] = []

  edgeIds.forEach((edgeId) => {
    if (seen.has(edgeId)) {
      return
    }
    seen.add(edgeId)
    next.push(edgeId)
  })

  return next
}

export type EditorRuntimeState = {
  tool: ValueStore<Tool>
  draw: DrawPreferencesState
  selection: SelectionState
  edit: EditState
  pointer: ValueStore<PointerSample | null>
  space: ValueStore<boolean>
}

export type RuntimeStateController = {
  state: EditorRuntimeState
  public: {
    state: Pick<EditorState, 'tool' | 'draw' | 'edit' | 'selection'>
  }
  resetLocal: () => void
  reconcileAfterCommit: (read: ReadNodeEdge) => void
}

export const createRuntimeState = ({
  initialTool,
  initialDrawPreferences
}: {
  initialTool: Tool
  initialDrawPreferences: DrawPreferences
}): RuntimeStateController => {
  const tool = createValueStore<Tool>(initialTool)
  const draw = createDrawPreferencesState(initialDrawPreferences)
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
      const currentSelection = selection.source.get()
      const nextNodeIds = uniqueNodeIds(
        currentSelection.nodeIds.filter((nodeId) => (
          Boolean(read.node.item.get(nodeId))
        ))
      )
      const nextEdgeIds = uniqueEdgeIds(
        currentSelection.edgeIds.filter((edgeId) => (
          Boolean(read.edge.item.get(edgeId))
        ))
      )

      if (
        !isOrderedArrayEqual(nextNodeIds, currentSelection.nodeIds)
        || !isOrderedArrayEqual(nextEdgeIds, currentSelection.edgeIds)
      ) {
        if (nextNodeIds.length > 0 || nextEdgeIds.length > 0) {
          selection.mutate.replace({
            nodeIds: nextNodeIds,
            edgeIds: nextEdgeIds
          })
        } else {
          selection.mutate.clear()
        }
      }

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

import { createValueStore, type ValueStore } from '@whiteboard/engine'
import type { Tool } from '../../types/tool'
import type { EditorRead, EditorState } from '../../types/editor'
import type { PointerSample } from '../../types/input'
import { createEditState, type EditState } from './edit'
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

const isOrderedEqual = (
  left: readonly string[],
  right: readonly string[]
) => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

export type EditorRuntimeState = {
  tool: ValueStore<Tool>
  selection: SelectionState
  edit: EditState
  pointer: ValueStore<PointerSample | null>
  space: ValueStore<boolean>
}

export type RuntimeStateController = {
  state: EditorRuntimeState
  public: {
    state: Pick<EditorState, 'tool' | 'edit' | 'selection'>
  }
  resetLocal: () => void
  reconcileAfterCommit: (read: ReadNodeEdge) => void
}

export const createRuntimeState = ({
  initialTool
}: {
  initialTool: Tool
}): RuntimeStateController => {
  const tool = createValueStore<Tool>(initialTool)
  const selection = createSelectionState()
  const edit = createEditState()
  const pointer = createValueStore<PointerSample | null>(null)
  const space = createValueStore(false)

  const publicState: Pick<EditorState, 'tool' | 'edit' | 'selection'> = {
    tool,
    edit: edit.source,
    selection: selection.source
  }

  return {
    state: {
      tool,
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
        !isOrderedEqual(nextNodeIds, currentSelection.nodeIds)
        || !isOrderedEqual(nextEdgeIds, currentSelection.edgeIds)
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
      if (currentEdit && !read.node.item.get(currentEdit.nodeId)) {
        edit.mutate.clear()
      }
    }
  }
}

import type { WhiteboardRuntime } from '../types/runtime'
import {
  readSelectionExactGroupIds,
  type SelectionTargetLike
} from './selection'

const isSameIds = (
  left: readonly string[],
  right: readonly string[]
) => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

const toCanvasRefs = (target: {
  nodeIds?: readonly string[]
  edgeIds?: readonly string[]
}) => [
  ...(target.nodeIds ?? []).map((id) => ({
    kind: 'node' as const,
    id
  })),
  ...(target.edgeIds ?? []).map((id) => ({
    kind: 'edge' as const,
    id
  }))
]

const resolveInsertedSelection = (inserted: {
  roots: {
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }
  allNodeIds: readonly string[]
  allEdgeIds: readonly string[]
}) => ({
  nodeIds: inserted.roots.nodeIds.length > 0
    ? inserted.roots.nodeIds
    : inserted.allNodeIds,
  edgeIds: inserted.roots.edgeIds.length > 0
    ? inserted.roots.edgeIds
    : inserted.allEdgeIds
})

type SelectionOrderMode =
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

export const replaceNodeSelection = (
  editor: WhiteboardRuntime,
  nodeIds: readonly string[]
) => {
  editor.commands.selection.replace({
    nodeIds
  })
}

export const replaceEdgeSelection = (
  editor: WhiteboardRuntime,
  edgeIds: readonly string[]
) => {
  editor.commands.selection.replace({
    edgeIds
  })
}

export const syncNodeSelection = (
  editor: WhiteboardRuntime,
  nodeIds: readonly string[]
) => {
  const current = editor.read.selection.target.get()
  if (isSameIds(current.nodeIds, nodeIds) && current.edgeIds.length === 0) {
    return
  }

  replaceNodeSelection(editor, nodeIds)
}

export const syncSingleEdgeSelection = (
  editor: WhiteboardRuntime,
  edgeId: string
) => {
  const current = editor.read.selection.target.get()
  if (
    current.nodeIds.length === 0
    && current.edgeIds.length === 1
    && current.edgeIds[0] === edgeId
  ) {
    return
  }

  replaceEdgeSelection(editor, [edgeId])
}

export const duplicateSelectionAndSelect = (
  editor: WhiteboardRuntime,
  target: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
  }
) => {
  const refs = toCanvasRefs(target)
  if (!refs.length) {
    return false
  }

  const result = editor.commands.canvas.duplicate(refs)
  if (!result.ok) {
    return false
  }

  editor.commands.selection.replace(resolveInsertedSelection(result.data))
  return true
}

export const deleteSelectionAndClear = (
  editor: WhiteboardRuntime,
  target: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
  }
) => {
  const refs = toCanvasRefs(target)
  if (!refs.length) {
    return false
  }

  const result = editor.commands.canvas.delete(refs)
  if (!result.ok) {
    return false
  }

  editor.commands.selection.clear()
  return true
}

export const orderSelection = (
  editor: WhiteboardRuntime,
  target: SelectionTargetLike,
  mode: SelectionOrderMode
) => {
  const groupIds = readSelectionExactGroupIds(editor, target)
  if (groupIds.length > 0) {
    if (mode === 'front') {
      return editor.commands.group.order.bringToFront([...groupIds])
    }
    if (mode === 'forward') {
      return editor.commands.group.order.bringForward([...groupIds])
    }
    if (mode === 'backward') {
      return editor.commands.group.order.sendBackward([...groupIds])
    }

    return editor.commands.group.order.sendToBack([...groupIds])
  }

  const refs = toCanvasRefs(target)
  if (!refs.length) {
    return false
  }

  if (mode === 'front') {
    return editor.commands.canvas.order.bringToFront(refs)
  }
  if (mode === 'forward') {
    return editor.commands.canvas.order.bringForward(refs)
  }
  if (mode === 'backward') {
    return editor.commands.canvas.order.sendBackward(refs)
  }

  return editor.commands.canvas.order.sendToBack(refs)
}

export const mergeGroupSelectionAndSelect = (
  editor: WhiteboardRuntime,
  target: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
  }
) => {
  const result = editor.commands.group.merge(target)
  if (!result.ok) {
    return false
  }

  const selection = editor.read.group.selection(result.data.groupId)
  if (selection) {
    editor.commands.selection.replace(selection)
    return true
  }

  editor.commands.selection.replace({
    nodeIds: target.nodeIds ?? [],
    edgeIds: target.edgeIds ?? []
  })
  return true
}

export const ungroupSelectionAndSelect = (
  editor: WhiteboardRuntime,
  groupIds: readonly string[]
) => {
  const result = editor.commands.group.ungroupMany([...new Set(groupIds)])
  if (!result.ok) {
    return false
  }

  editor.commands.selection.replace({
    nodeIds: result.data.nodeIds,
    edgeIds: result.data.edgeIds
  })
  return true
}

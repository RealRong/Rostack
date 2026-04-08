import {
  createFrameNodeInput
} from '@whiteboard/core/node'
import type { Rect } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '#react/types/runtime'
import {
  readSelectionExactGroupIds,
  type SelectionTargetLike
} from './selection'

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

export const createContainerFrameAndSelect = (
  editor: WhiteboardRuntime,
  bounds: Rect,
  padding = 32
) => {
  const frame = createFrameNodeInput()
  const result = editor.commands.node.create({
    ...frame,
    position: {
      x: bounds.x - padding,
      y: bounds.y - padding
    },
    size: {
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    }
  })
  if (!result.ok) {
    return false
  }

  editor.commands.selection.replace({
    nodeIds: [result.data.nodeId]
  })
  return true
}

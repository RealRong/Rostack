import type { WhiteboardRuntime } from '../types/runtime'

const isSameIds = (
  left: readonly string[],
  right: readonly string[]
) => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

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

export const duplicateNodesAndSelect = (
  editor: WhiteboardRuntime,
  nodeIds: readonly string[]
) => {
  const result = editor.commands.node.duplicate([...nodeIds])
  if (!result.ok || result.data.nodeIds.length === 0) {
    return false
  }

  replaceNodeSelection(editor, result.data.nodeIds)
  return true
}

export const groupNodesAndSelect = (
  editor: WhiteboardRuntime,
  nodeIds: readonly string[]
) => {
  const result = editor.commands.node.group.create([...nodeIds])
  if (!result.ok) {
    return false
  }

  replaceNodeSelection(editor, [result.data.groupId])
  return true
}

export const ungroupNodesAndSelect = (
  editor: WhiteboardRuntime,
  groupIds: readonly string[]
) => {
  const result = editor.commands.node.group.ungroupMany([...groupIds])
  if (!result.ok) {
    return false
  }

  replaceNodeSelection(editor, result.data.nodeIds)
  return true
}

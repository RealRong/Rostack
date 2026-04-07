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

export const groupSelectionAndSelect = (
  editor: WhiteboardRuntime,
  target: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
  }
) => {
  const result = editor.commands.node.group.create(target)
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

export const ungroupNodesAndSelect = (
  editor: WhiteboardRuntime,
  groupIds: readonly string[]
) => {
  const result = editor.commands.node.group.ungroupMany([...new Set(groupIds)])
  if (!result.ok) {
    return false
  }

  editor.commands.selection.replace({
    nodeIds: result.data.nodeIds,
    edgeIds: result.data.edgeIds
  })
  return true
}

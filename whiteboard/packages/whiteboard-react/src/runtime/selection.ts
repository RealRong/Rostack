import type { WhiteboardRuntime } from '../types/runtime'

export type SelectionTargetLike = {
  nodeIds?: readonly string[]
  edgeIds?: readonly string[]
}

const EMPTY_GROUP_IDS: readonly string[] = []

const uniq = (
  ids: readonly string[] | undefined
) => ids ? [...new Set(ids)] : []

const readTargetGroupIds = (
  editor: WhiteboardRuntime,
  target: SelectionTargetLike
) => {
  const groupIds = new Set<string>()

  uniq(target.nodeIds).forEach((nodeId) => {
    const groupId = editor.read.group.ofNode(nodeId)
    if (groupId) {
      groupIds.add(groupId)
    }
  })

  uniq(target.edgeIds).forEach((edgeId) => {
    const groupId = editor.read.group.ofEdge(edgeId)
    if (groupId) {
      groupIds.add(groupId)
    }
  })

  return [...groupIds]
}

export const readSelectionWholeGroupIds = (
  editor: WhiteboardRuntime,
  target: SelectionTargetLike
): readonly string[] => {
  const selectedNodeIds = new Set(uniq(target.nodeIds))
  const selectedEdgeIds = new Set(uniq(target.edgeIds))

  return readTargetGroupIds(editor, target).filter((groupId) => {
    const nodeIds = editor.read.group.nodeIds(groupId)
    const edgeIds = editor.read.group.edgeIds(groupId)

    return (
      (nodeIds.length > 0 || edgeIds.length > 0)
      && nodeIds.every((id) => selectedNodeIds.has(id))
      && edgeIds.every((id) => selectedEdgeIds.has(id))
    )
  })
}

export const readSelectionExactGroupIds = (
  editor: WhiteboardRuntime,
  target: SelectionTargetLike
): readonly string[] => {
  const wholeGroupIds = readSelectionWholeGroupIds(editor, target)
  if (!wholeGroupIds.length) {
    return EMPTY_GROUP_IDS
  }

  const selectedNodeIds = uniq(target.nodeIds)
  const selectedEdgeIds = uniq(target.edgeIds)
  const expectedNodeIds = new Set<string>()
  const expectedEdgeIds = new Set<string>()

  wholeGroupIds.forEach((groupId) => {
    editor.read.group.nodeIds(groupId).forEach((id) => {
      expectedNodeIds.add(id)
    })
    editor.read.group.edgeIds(groupId).forEach((id) => {
      expectedEdgeIds.add(id)
    })
  })

  if (
    selectedNodeIds.length !== expectedNodeIds.size
    || selectedEdgeIds.length !== expectedEdgeIds.size
  ) {
    return EMPTY_GROUP_IDS
  }

  return (
    selectedNodeIds.every((id) => expectedNodeIds.has(id))
    && selectedEdgeIds.every((id) => expectedEdgeIds.has(id))
  )
    ? wholeGroupIds
    : EMPTY_GROUP_IDS
}

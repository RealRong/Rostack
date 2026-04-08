import type { SelectionTarget } from '@whiteboard/core/selection'
import type {
  CanvasItemRef,
  GroupId
} from '@whiteboard/core/types'
import type { EditorRead } from '../../types/editor'

export const toCanvasRefs = (
  target: SelectionTarget
): CanvasItemRef[] => [
  ...target.nodeIds.map((id) => ({
    kind: 'node' as const,
    id
  })),
  ...target.edgeIds.map((id) => ({
    kind: 'edge' as const,
    id
  }))
]

export const resolveInsertedSelection = (inserted: {
  roots: {
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }
  allNodeIds: readonly string[]
  allEdgeIds: readonly string[]
}): SelectionTarget => ({
  nodeIds: inserted.roots.nodeIds.length > 0
    ? inserted.roots.nodeIds
    : inserted.allNodeIds,
  edgeIds: inserted.roots.edgeIds.length > 0
    ? inserted.roots.edgeIds
    : inserted.allEdgeIds
})

export const readGroupTarget = (
  read: Pick<EditorRead, 'group'>,
  groupId: GroupId
): SelectionTarget | undefined => {
  const nodeIds = read.group.nodeIds(groupId)
  const edgeIds = read.group.edgeIds(groupId)

  return nodeIds.length > 0 || edgeIds.length > 0
    ? {
        nodeIds,
        edgeIds
      }
    : undefined
}

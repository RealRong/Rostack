import type {
  Document,
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  MindmapTree
} from '@whiteboard/core/mindmap'
import type { IndexState } from '../../contracts/working'
import {
  readMindmapNodeIds,
  readMindmapTree
} from '../mindmap'

export const readRelatedEdgeIds = (
  state: Pick<IndexState, 'edgeIdsByNode'>,
  nodeIds: Iterable<NodeId>
): readonly EdgeId[] => {
  const related = new Set<EdgeId>()
  for (const nodeId of nodeIds) {
    state.edgeIdsByNode.get(nodeId)?.forEach((edgeId) => {
      related.add(edgeId)
    })
  }
  return [...related]
}

export const readMindmapId = (input: {
  document: Document
  indexes: Pick<IndexState, 'ownerByNode'>
  value: string
}): MindmapId | undefined => {
  if (input.document.mindmaps[input.value]) {
    return input.value as MindmapId
  }

  const owner = input.indexes.ownerByNode.get(input.value as NodeId)
  return owner?.kind === 'mindmap'
    ? owner.id
    : undefined
}

export const readMindmapStructure = (input: {
  document: Document
  indexes: Pick<IndexState, 'ownerByNode' | 'mindmapNodes'>
  value: MindmapId | NodeId
}): {
  id: MindmapId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapTree
} | undefined => {
  const id = readMindmapId({
    document: input.document,
    indexes: input.indexes,
    value: input.value
  })
  if (!id) {
    return undefined
  }

  const record = input.document.mindmaps[id]
  const tree = readMindmapTree(record)
  if (!record || !tree) {
    return undefined
  }

  return {
    id,
    rootId: record.root,
    nodeIds: input.indexes.mindmapNodes.get(id) ?? readMindmapNodeIds(record),
    tree
  }
}

export const readTreeDescendants = (
  state: Pick<IndexState, 'childrenByNode'>,
  rootIds: readonly NodeId[]
): readonly NodeId[] => {
  const result: NodeId[] = []
  const visited = new Set<NodeId>()
  const stack = [...rootIds].reverse()

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    const children = state.childrenByNode.get(current) ?? []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index]!
      if (visited.has(childId)) {
        continue
      }

      visited.add(childId)
      result.push(childId)
      stack.push(childId)
    }
  }

  return result
}

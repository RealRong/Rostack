import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  Document,
} from '@whiteboard/core/types'
import type {
  MindmapTree
} from '@whiteboard/core/mindmap'
import type { IndexState } from '../../contracts/working'
import {
  readMindmapNodeIds,
  readMindmapTree
} from '../graph/mindmap'

export const readRelatedEdgeIds = (
  state: Pick<IndexState, 'edgeIdsByNode'>,
  nodeIds: Iterable<string>
): readonly string[] => {
  const related = new Set<string>()
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
}): string | undefined => {
  const resolved = mindmapApi.tree.resolveId(input.document, input.value)
  if (resolved) {
    return resolved
  }

  const owner = input.indexes.ownerByNode.get(input.value)
  return owner?.kind === 'mindmap' ? owner.id : undefined
}

export const readMindmapStructure = (input: {
  document: Document
  indexes: Pick<IndexState, 'ownerByNode' | 'mindmapNodes'>
  value: string
}): {
  id: string
  rootId: string
  nodeIds: readonly string[]
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
  if (!record || !tree || !record.tree.rootId) {
    return undefined
  }

  return {
    id,
    rootId: record.tree.rootId,
    nodeIds: input.indexes.mindmapNodes.get(id) ?? readMindmapNodeIds(record),
    tree
  }
}

export const readTreeDescendants = (
  state: Pick<IndexState, 'childrenByNode'>,
  rootIds: readonly string[]
): readonly string[] => {
  const result: string[] = []
  const visited = new Set<string>()
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

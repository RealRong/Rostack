import type { NodeId } from '@whiteboard/core/types'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorSceneDerived } from '@whiteboard/editor/editor/derived/types'
import type {
  SelectionNodeStats,
  SelectionNodeTypeInfo
} from '@whiteboard/editor/types/selectionPresentation'

export const createSelectionNodeStats = (input: {
  summary: ReturnType<EditorSceneDerived['selection']['summary']['get']>
  nodeType: Pick<NodeTypeSupport, 'meta'>
}): SelectionNodeStats => {
  const nodes = input.summary.items.nodes
  const ids = input.summary.target.nodeIds
  const count = ids.length
  const lockedCount = nodes.reduce(
    (total, node) => total + (node.locked ? 1 : 0),
    0
  )
  const statsByType = new Map<string, {
    key: string
    name: string
    family: SelectionNodeTypeInfo['family']
    icon: string
    count: number
    nodeIds: NodeId[]
  }>()

  nodes.forEach((node) => {
    const meta = input.nodeType.meta(node.type)
    const key = meta.type || node.type
    const current = statsByType.get(key)
    if (current) {
      current.count += 1
      current.nodeIds.push(node.id)
      return
    }

    statsByType.set(key, {
      key,
      name: meta.name,
      family: meta.family,
      icon: meta.icon,
      count: 1,
      nodeIds: [node.id]
    })
  })

  const types = [...statsByType.values()]
    .sort((left, right) => (
      right.count - left.count || left.key.localeCompare(right.key)
    ))
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      family: entry.family,
      icon: entry.icon,
      count: entry.count,
      nodeIds: entry.nodeIds
    }))

  return {
    ids,
    count,
    hasGroup: input.summary.groups.count > 0,
    lock:
      count === 0
        ? 'none'
        : lockedCount === count
          ? 'all'
          : lockedCount === 0
            ? 'none'
            : 'mixed',
    types
  }
}

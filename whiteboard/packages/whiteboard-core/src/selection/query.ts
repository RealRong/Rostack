import type {
  Edge,
  EdgeId,
  NodeId,
  NodeModel
} from '@whiteboard/core/types'
import type {
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection/model'

export type SelectionNodeStats = {
  ids: readonly NodeId[]
  count: number
  hasGroup: boolean
  lock: 'none' | 'mixed' | 'all'
  types: readonly {
    key: string
    name: string
    family: string
    icon: string
    count: number
    nodeIds: readonly NodeId[]
  }[]
}

export type SelectionEdgeStats = {
  ids: readonly EdgeId[]
  count: number
  types: readonly {
    key: string
    name: string
    count: number
    edgeIds: readonly EdgeId[]
    edgeType?: Edge['type']
  }[]
}

export const readSingleSelectedNodeId = (
  target: SelectionTarget
): NodeId | undefined => (
  target.nodeIds.length === 1
  && target.edgeIds.length === 0
    ? target.nodeIds[0]
    : undefined
)

export const readSingleSelectedEdgeId = (
  target: SelectionTarget
): EdgeId | undefined => (
  target.nodeIds.length === 0
  && target.edgeIds.length === 1
    ? target.edgeIds[0]
    : undefined
)

const readEdgeTypeName = (
  type: string
) => (
  type === 'straight'
    ? 'Straight'
    : type === 'elbow'
      ? 'Elbow'
      : type === 'fillet'
        ? 'Fillet'
        : type === 'curve'
          ? 'Curve'
          : type
)

export const deriveSelectionNodeStats = (input: {
  summary: SelectionSummary
  resolveNodeMeta(node: NodeModel): {
    key: string
    name: string
    family: string
    icon: string
  }
}): SelectionNodeStats => {
  const nodes = input.summary.items.nodes
  const ids = input.summary.target.nodeIds
  const count = ids.length
  const hasGroup = input.summary.groups.count > 0
  const lockedCount = nodes.reduce(
    (total, node) => total + (node.locked ? 1 : 0),
    0
  )
  const statsByType = new Map<string, {
    key: string
    name: string
    family: string
    icon: string
    count: number
    nodeIds: NodeId[]
  }>()

  nodes.forEach((node) => {
    const meta = input.resolveNodeMeta(node)
    const key = meta.key || node.type
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

  return {
    ids,
    count,
    hasGroup,
    lock:
      count === 0
        ? 'none'
        : lockedCount === count
          ? 'all'
          : lockedCount === 0
            ? 'none'
            : 'mixed',
    types: [...statsByType.values()]
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
  }
}

export const deriveSelectionEdgeStats = (
  summary: SelectionSummary
): SelectionEdgeStats => {
  const edges = summary.items.edges
  const ids = summary.target.edgeIds
  const count = ids.length
  const statsByType = new Map<string, {
    key: string
    name: string
    edgeType?: Edge['type']
    count: number
    edgeIds: EdgeId[]
  }>()

  edges.forEach((edge) => {
    const key = edge.type
    const current = statsByType.get(key)
    if (current) {
      current.count += 1
      current.edgeIds.push(edge.id)
      return
    }

    statsByType.set(key, {
      key,
      name: readEdgeTypeName(key),
      edgeType: edge.type,
      count: 1,
      edgeIds: [edge.id]
    })
  })

  return {
    ids,
    count,
    types: [...statsByType.values()]
      .sort((left, right) => (
        right.count - left.count || left.key.localeCompare(right.key)
      ))
      .map((entry) => ({
        key: entry.key,
        name: entry.name,
        count: entry.count,
        edgeIds: entry.edgeIds,
        edgeType: entry.edgeType
      }))
  }
}

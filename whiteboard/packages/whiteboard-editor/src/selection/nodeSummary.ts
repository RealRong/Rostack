import type { SelectionSummary } from '@whiteboard/core/selection'
import type { Node, NodeId } from '@whiteboard/core/types'
import type {
  ControlId,
  NodeFamily,
  NodeMeta,
  NodeRegistry
} from '../types/node'

export type SelectionNodeTypeInfo = {
  key: string
  name: string
  family: NodeFamily
  icon: string
  count: number
  nodeIds: readonly NodeId[]
}

export type SelectionNodeInfo = {
  lock: 'none' | 'mixed' | 'all'
  types: readonly SelectionNodeTypeInfo[]
}

export type SelectionNodeStats = {
  ids: readonly NodeId[]
  count: number
  hasGroup: boolean
  lock: SelectionNodeInfo['lock']
  types: readonly SelectionNodeTypeInfo[]
  mixed: boolean
}

const EMPTY_CONTROLS: readonly ControlId[] = []

const readNodeMeta = (
  registry: Pick<NodeRegistry, 'get'>,
  node: Node
): NodeMeta => {
  const definition = registry.get(node.type)
  const meta = definition?.describe?.(node) ?? definition?.meta

  if (meta) {
    return meta
  }

  return {
    key: node.type,
    name: node.type,
    family: 'shape',
    icon: node.type,
    controls: EMPTY_CONTROLS
  }
}

export const readSelectionNodeStats = ({
  summary,
  registry
}: {
  summary: SelectionSummary
  registry: Pick<NodeRegistry, 'get'>
}): SelectionNodeStats => {
  const nodes = summary.items.nodes
  const ids = summary.target.nodeIds
  const count = ids.length
  const hasGroup = summary.groups.count > 0
  const lockedCount = nodes.reduce(
    (total, node) => total + (node.locked ? 1 : 0),
    0
  )
  const statsByType = new Map<string, {
    key: string
    name: string
    family: NodeFamily
    icon: string
    count: number
    nodeIds: NodeId[]
  }>()

  nodes.forEach((node) => {
    const meta = readNodeMeta(registry, node)
    const key = meta.key ?? node.type
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
    hasGroup,
    lock:
      count === 0
        ? 'none'
        : lockedCount === count
          ? 'all'
          : lockedCount === 0
            ? 'none'
            : 'mixed',
    types,
    mixed: types.length > 1
  }
}

export const readSelectionNodeInfo = ({
  summary,
  registry
}: {
  summary: SelectionSummary
  registry: Pick<NodeRegistry, 'get'>
}): SelectionNodeInfo | undefined => {
  if (summary.items.nodeCount === 0 || summary.items.edgeCount > 0) {
    return undefined
  }

  const stats = readSelectionNodeStats({
    summary,
    registry
  })

  return {
    lock: stats.lock,
    types: stats.types
  }
}

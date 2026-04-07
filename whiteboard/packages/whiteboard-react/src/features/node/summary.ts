import type { SelectionSummary } from '@whiteboard/core/selection'
import type { Node, NodeId, NodeSchema } from '@whiteboard/core/types'
import type {
  ControlId,
  NodeFamily,
  NodeMeta,
  NodeRegistry
} from '../../types/node'

export type NodeTypeSummary = {
  key: string
  name: string
  family: NodeFamily
  icon: string
  count: number
  nodeIds: readonly NodeId[]
}

export type NodeSummary = {
  ids: readonly NodeId[]
  count: number
  hasGroup: boolean
  lock: 'none' | 'mixed' | 'all'
  types: readonly NodeTypeSummary[]
  mixed: boolean
}

export type NodeSelectionCan = {
  fill: boolean
  stroke: boolean
  text: boolean
  group: boolean
  align: boolean
  distribute: boolean
  makeGroup: boolean
  ungroup: boolean
  order: boolean
  filter: boolean
  lock: boolean
  copy: boolean
  cut: boolean
  duplicate: boolean
  delete: boolean
}

export type NodeSelectionStyle = {
  stroke: string
  strokeWidth: number
  strokeWidthPreset: 'default' | 'draw'
  opacity?: number
}

type NodeSummaryView = {
  types: readonly NodeTypeSummary[]
  overflow: number
  title: string
  detail?: string
  mixed: boolean
}

const DEFAULT_PREVIEW_LIMIT = 3
const EMPTY_CONTROLS: readonly ControlId[] = []

const EMPTY_CAN: NodeSelectionCan = {
  fill: false,
  stroke: false,
  text: false,
  group: false,
  align: false,
  distribute: false,
  makeGroup: false,
  ungroup: false,
  order: false,
  filter: false,
  lock: false,
  copy: false,
  cut: false,
  duplicate: false,
  delete: false
}

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

const hasControl = (
  meta: NodeMeta,
  control: ControlId
) => meta.controls.includes(control)

const hasStyleField = (
  schema: NodeSchema | undefined,
  path: string
) => schema?.fields.some((field) => field.scope === 'style' && field.path === path) ?? false

const canEditStrokeStyle = (
  node: Node,
  schema: NodeSchema | undefined
) => (
  hasStyleField(schema, 'stroke')
  || hasStyleField(schema, 'strokeWidth')
  || typeof node.style?.stroke === 'string'
  || typeof node.style?.strokeWidth === 'number'
)

const canEditOpacityStyle = (
  node: Node,
  schema: NodeSchema | undefined
) => (
  hasStyleField(schema, 'opacity')
  || typeof node.style?.opacity === 'number'
)

export const readNodeSelectionCan = ({
  summary,
  registry
}: {
  summary: SelectionSummary
  registry: Pick<NodeRegistry, 'get'>
}): NodeSelectionCan => {
  const nodes = summary.items.nodes
  const count = nodes.length
  if (!count || summary.items.edgeCount > 0) {
    return EMPTY_CAN
  }

  const metas = nodes.map((node) => readNodeMeta(registry, node))
  const hasShared = (control: ControlId) => metas.every((meta) => hasControl(meta, control))
  const mixedTypes = new Set(
    nodes.map((node, index) => metas[index]?.key ?? node.type)
  ).size > 1

  return {
    fill: hasShared('fill'),
    stroke: hasShared('stroke'),
    text: count === 1 && hasShared('text'),
    group: count === 1 && hasShared('group'),
    align: count >= 2,
    distribute: count >= 3,
    makeGroup: count >= 2,
    ungroup: summary.groups.count > 0,
    order: true,
    filter: mixedTypes,
    lock: true,
    copy: true,
    cut: true,
    duplicate: true,
    delete: true
  }
}

export const readNodeSummary = ({
  summary,
  registry
}: {
  summary: SelectionSummary
  registry: Pick<NodeRegistry, 'get'>
}): NodeSummary => {
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

export const readNodeSelectionStyle = ({
  summary,
  registry
}: {
  summary: SelectionSummary
  registry: Pick<NodeRegistry, 'get'>
}): NodeSelectionStyle | null => {
  const nodes = summary.items.nodes
  const edges = summary.items.edges

  if (!nodes.length || edges.length > 0) {
    return null
  }

  const sources = nodes.map((node) => ({
    node,
    schema: registry.get(node.type)?.schema
  }))
  const supportsStroke = sources.every(({ node, schema }) => canEditStrokeStyle(node, schema))
  if (!supportsStroke) {
    return null
  }

  const supportsOpacity = sources.every(({ node, schema }) => canEditOpacityStyle(node, schema))
  const primary = nodes[0]
  const stroke = typeof primary?.style?.stroke === 'string'
    ? primary.style.stroke
    : 'var(--ui-text-primary)'
  const strokeWidth = typeof primary?.style?.strokeWidth === 'number'
    ? primary.style.strokeWidth
    : 1
  const opacity = typeof primary?.style?.opacity === 'number'
    ? primary.style.opacity
    : 1

  return {
    stroke,
    strokeWidth,
    strokeWidthPreset: nodes.every((node) => node.type === 'draw')
      ? 'draw'
      : 'default',
    opacity: supportsOpacity ? opacity : undefined
  }
}

export const readNodeLockLabel = (
  summary: NodeSummary
) => (
  summary.lock === 'all'
    ? (summary.count > 1 ? 'Unlock selected' : 'Unlock')
    : (summary.count > 1 ? 'Lock selected' : 'Lock')
)

export const readNodeSummaryTitle = (
  summary: NodeSummary
) => (
  summary.count <= 1
    ? (summary.types[0]?.name ?? 'Item')
    : `${summary.count} items`
)

export const readNodeSummaryDetail = (
  summary: NodeSummary
) => {
  if (!summary.types.length) {
    return undefined
  }

  return summary.types
    .map((item) => item.count > 1 ? `${item.name} ×${item.count}` : item.name)
    .join(' · ')
}

export const readNodeSummaryView = (
  summary: NodeSummary,
  options?: {
    previewLimit?: number
  }
): NodeSummaryView | undefined => {
  const previewLimit = Math.max(1, options?.previewLimit ?? DEFAULT_PREVIEW_LIMIT)
  const types = summary.types.slice(0, previewLimit)

  if (!summary.count || !types.length) {
    return undefined
  }

  return {
    types,
    overflow: Math.max(0, summary.types.length - types.length),
    title: readNodeSummaryTitle(summary),
    detail: readNodeSummaryDetail(summary),
    mixed: summary.mixed
  }
}

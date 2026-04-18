import {
  TEXT_DEFAULT_FONT_SIZE,
  readShapeKind
} from '@whiteboard/core/node'
import {
  createDerivedStore,
  read,
  sameOptionalNumberArray as isSameOptionalNumberArray,
  sameOptionalRect as isSameOptionalRectTuple,
  type ReadStore
} from '@shared/core'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type { Edge, MindmapNodeId, Node, NodeSchema, Rect } from '@whiteboard/core/types'
import type {
  SelectionEdgeTypeInfo,
  SelectionNodeInfo,
  SelectionNodeTypeInfo,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarEdgeScope,
  SelectionToolbarLockState,
  SelectionToolbarNodeKind,
  SelectionToolbarNodeScope,
  SelectionToolbarScope
} from '@whiteboard/editor/types/selectionPresentation'
import type {
  ControlId,
  NodeFamily,
  NodeMeta,
  NodeRegistry
} from '@whiteboard/editor/types/node'
import type {
  EditorDefaults,
  EditorNodePaintDefaults
} from '@whiteboard/editor/types/defaults'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { EditSession } from '@whiteboard/editor/session/edit'
import { readUniformValue } from '@whiteboard/editor/query/utils'
import type { SelectionModelRead } from '@whiteboard/editor/query/selection/model'
import type { EditorInputState } from '@whiteboard/editor/session/interaction'
import type { MindmapPresentationRead } from '@whiteboard/editor/query/mindmap/read'

export type SelectionRead = {
  box: ReadStore<Rect | undefined>
  node: ReadStore<SelectionNodeInfo | undefined>
  overlay: ReadStore<SelectionOverlay | undefined>
  toolbar: ReadStore<SelectionToolbarContext | undefined>
}

type StyleFieldKind = 'string' | 'number' | 'numberArray'

type SelectionNodeStats = {
  ids: readonly string[]
  count: number
  hasGroup: boolean
  lock: SelectionNodeInfo['lock']
  types: readonly SelectionNodeTypeInfo[]
}

type SelectionEdgeStats = {
  ids: readonly string[]
  count: number
  types: readonly SelectionEdgeTypeInfo[]
}

const EMPTY_CONTROLS: readonly ControlId[] = []

const readNodeCountLabel = (
  count: number
) => count === 1 ? '1 node' : `${count} nodes`

const readEdgeCountLabel = (
  count: number
) => count === 1 ? '1 edge' : `${count} edges`

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

const readString = (
  node: Node,
  key: string
) => {
  const value = node.style?.[key]
  return typeof value === 'string' ? value : undefined
}

const readNumber = (
  node: Node,
  key: string
) => {
  const value = node.style?.[key]
  return typeof value === 'number' ? value : undefined
}

const readNumberArray = (
  node: Node,
  key: string
) => {
  const value = node.style?.[key]
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
    ? value
    : undefined
}

const normalizeDash = (
  value: readonly number[] | undefined
) => value?.length ? value : undefined

const hasStyleField = (
  schema: NodeSchema | undefined,
  path: string
) => schema?.fields.some((field) => field.scope === 'style' && field.path === path) ?? false

const supportsStyleField = (
  nodes: readonly Node[],
  registry: Pick<NodeRegistry, 'get'>,
  path: string,
  kind: StyleFieldKind
) => nodes.every((node) => {
  const schema = registry.get(node.type)?.schema
  if (hasStyleField(schema, path)) {
    return true
  }

  const value = node.style?.[path]
  if (kind === 'string') {
    return typeof value === 'string'
  }
  if (kind === 'number') {
    return typeof value === 'number'
  }

  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
})

const readSelectionNodeStats = ({
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
    nodeIds: string[]
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
    types
  }
}

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

const readSelectionEdgeStats = (
  summary: SelectionSummary
): SelectionEdgeStats => {
  const edges = summary.items.edges
  const ids = summary.target.edgeIds
  const count = ids.length
  const statsByType = new Map<string, {
    key: string
    name: string
    edgeType?: string
    count: number
    edgeIds: string[]
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

  const types = [...statsByType.values()]
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

  return {
    ids,
    count,
    types
  }
}

const resolveToolbarNodeKind = (
  nodes: readonly Node[],
  summary: SelectionNodeStats
): SelectionToolbarNodeKind => {
  if (nodes.every((node) => node.type === 'shape')) {
    return 'shape'
  }
  if (nodes.every((node) => node.type === 'text')) {
    return 'text'
  }
  if (nodes.every((node) => node.type === 'sticky')) {
    return 'sticky'
  }
  if (
    summary.count === 1
    && summary.types.length === 1
    && summary.types[0]?.key === 'group'
  ) {
    return 'group'
  }
  if (nodes.every((node) => node.type === 'frame')) {
    return 'frame'
  }
  if (nodes.every((node) => node.type === 'draw')) {
    return 'draw'
  }

  return 'mixed'
}

const hasControl = (
  nodes: readonly Node[],
  registry: Pick<NodeRegistry, 'get'>,
  control: 'fill' | 'stroke' | 'text'
) => nodes.every((node) => readNodeMeta(registry, node).controls.includes(control))

const readDefaultFill = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.fill

const readFill = (
  node: Node,
  defaults: EditorNodePaintDefaults | undefined
) => readString(node, 'fill') ?? readDefaultFill(defaults)

const readFillOpacity = (
  node: Node
) => readNumber(node, 'fillOpacity')
  ?? (node.type === 'shape' ? 1 : undefined)

const readDefaultStroke = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.stroke

const readStroke = (
  node: Node,
  defaults: EditorNodePaintDefaults | undefined
) => readString(node, 'stroke') ?? readDefaultStroke(defaults)

const readDefaultStrokeWidth = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.strokeWidth

const readStrokeWidth = (
  node: Node,
  defaults: EditorNodePaintDefaults | undefined
) => readNumber(node, 'strokeWidth') ?? readDefaultStrokeWidth(defaults)

const readStrokeOpacity = (
  node: Node
) => readNumber(node, 'strokeOpacity')
  ?? (node.type === 'shape' ? 1 : undefined)

const readOpacity = (
  node: Node
) => readNumber(node, 'opacity') ?? 1

const readStrokeDash = (
  node: Node
) => readNumberArray(node, 'strokeDash')

const readDefaultTextColor = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.color

const readTextColor = (
  node: Node,
  defaults: EditorNodePaintDefaults | undefined
) => readString(node, 'color') ?? readDefaultTextColor(defaults)

const readFontSize = (
  node: Node
) => readNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE

const readFontWeight = (
  node: Node
) => readNumber(node, 'fontWeight') ?? 400

const readFontStyle = (
  node: Node
) => readString(node, 'fontStyle') === 'italic'
  ? 'italic'
  : 'normal'

const readTextAlign = (
  node: Node
) => {
  const value = readString(node, 'textAlign')
  if (value === 'left' || value === 'right' || value === 'center') {
    return value
  }

  return node.type === 'shape' ? 'center' : 'left'
}

const readToolbarValue = <TValue,>(
  enabled: boolean,
  nodes: readonly Node[],
  readValue: (node: Node) => TValue,
  equal?: (left: TValue, right: TValue) => boolean
) => enabled
  ? readUniformValue(nodes, readValue, equal)
  : undefined

const readNodeScope = ({
  nodes,
  nodeIds,
  primaryNode,
  registry,
  nodeStats,
  mindmap,
  defaults
}: {
  nodes: readonly Node[]
  nodeIds: readonly string[]
  primaryNode?: Node
  registry: Pick<NodeRegistry, 'get'>
  nodeStats: SelectionNodeStats
  mindmap: Pick<MindmapPresentationRead, 'tree'>
  defaults: EditorDefaults['selection']
}): SelectionToolbarNodeScope => {
  const readPaintDefaults = defaults.node.readPaint
  const nodeKind = resolveToolbarNodeKind(nodes, {
    ...nodeStats,
    ids: nodeIds,
    count: nodeIds.length,
    lock:
      nodeIds.length === 0
        ? 'none'
        : nodes.every((node) => node.locked)
          ? 'all'
          : nodes.some((node) => node.locked)
            ? 'mixed'
            : 'none',
    hasGroup: nodes.some((node) => Boolean(node.groupId)),
    types: nodeStats.types.filter((entry) => entry.nodeIds.some((id) => nodeIds.includes(id)))
  })
  const canEditFill = hasControl(nodes, registry, 'fill')
  const canEditStroke = hasControl(nodes, registry, 'stroke')
  const canEditTextColor = hasControl(nodes, registry, 'text')
    && supportsStyleField(nodes, registry, 'color', 'string')
  const styleSupport = {
    fontSize: supportsStyleField(nodes, registry, 'fontSize', 'number'),
    fontWeight: supportsStyleField(nodes, registry, 'fontWeight', 'number'),
    fontStyle: supportsStyleField(nodes, registry, 'fontStyle', 'string'),
    textAlign: supportsStyleField(nodes, registry, 'textAlign', 'string'),
    fillOpacity: supportsStyleField(nodes, registry, 'fillOpacity', 'number'),
    strokeOpacity: supportsStyleField(nodes, registry, 'strokeOpacity', 'number'),
    strokeDash: supportsStyleField(nodes, registry, 'strokeDash', 'numberArray'),
    opacity: supportsStyleField(nodes, registry, 'opacity', 'number')
  }
  const canEditFillOpacity = canEditFill && styleSupport.fillOpacity
  const canEditStrokeOpacity = canEditStroke && styleSupport.strokeOpacity
  const canEditStrokeDash = canEditStroke && styleSupport.strokeDash
  const mindmapOwned = nodes.length > 0
    && nodes.every((entry) => entry.type === 'text' && Boolean(entry.mindmapId))
  const treeIds = mindmapOwned
    ? [...new Set(nodes.map((entry) => entry.mindmapId).filter(Boolean))]
    : []
  const mindmapTreeId = treeIds.length === 1
    ? treeIds[0]
    : undefined
  const mindmapTree = mindmapTreeId
    ? read(mindmap.tree, mindmapTreeId)
    : undefined
  const readMindmapBranchValue = <TValue,>(
    select: (branch: NonNullable<typeof mindmapTree>['nodes'][MindmapNodeId]['branch']) => TValue
  ) => (
    mindmapTreeId && mindmapTree
      ? readUniformValue(
          nodeIds as readonly MindmapNodeId[],
          (nodeId) => {
            const branch = mindmapTree.nodes[nodeId]?.branch
            return branch ? select(branch) : undefined
          }
        )
      : undefined
  )

  return {
    kind: nodeKind,
    nodeIds,
    nodes,
    primaryNode,
    canChangeShapeKind: nodeKind === 'shape',
    canEditFontSize: styleSupport.fontSize,
    canEditFontWeight: styleSupport.fontWeight,
    canEditFontStyle: styleSupport.fontStyle,
    canEditTextAlign: styleSupport.textAlign,
    canEditTextColor,
    canEditFill,
    canEditFillOpacity,
    canEditStroke,
    canEditStrokeOpacity,
    canEditStrokeDash,
    canEditNodeOpacity: styleSupport.opacity,
    shapeKind:
      nodeKind === 'shape' && primaryNode
        ? readShapeKind(primaryNode)
        : undefined,
    shapeKindValue:
      nodeKind === 'shape'
        ? readUniformValue(nodes, readShapeKind)
        : undefined,
    fontSize: readToolbarValue(styleSupport.fontSize, nodes, readFontSize),
    fontWeight: readToolbarValue(styleSupport.fontWeight, nodes, readFontWeight),
    fontStyle: readToolbarValue(styleSupport.fontStyle, nodes, readFontStyle),
    textAlign: readToolbarValue(styleSupport.textAlign, nodes, readTextAlign),
    textColor: readToolbarValue(
      canEditTextColor,
      nodes,
      (node) => readTextColor(node, readPaintDefaults(node))
    ),
    fill: readToolbarValue(
      canEditFill,
      nodes,
      (node) => readFill(node, readPaintDefaults(node))
    ),
    fillOpacity: readToolbarValue(canEditFillOpacity, nodes, readFillOpacity),
    stroke: readUniformValue(nodes, (node) => readStroke(node, readPaintDefaults(node))),
    strokeWidth: readUniformValue(nodes, (node) => readStrokeWidth(node, readPaintDefaults(node))),
    strokeOpacity: readToolbarValue(canEditStrokeOpacity, nodes, readStrokeOpacity),
    strokeDash: readToolbarValue(
      canEditStrokeDash,
      nodes,
      readStrokeDash,
      (left, right) => isSameOptionalNumberArray(
        normalizeDash(left),
        normalizeDash(right)
      )
    ),
    opacity: readToolbarValue(styleSupport.opacity, nodes, readOpacity),
    mindmap: mindmapOwned
      ? {
          treeId: mindmapTreeId,
          nodeIds: nodeIds as readonly MindmapNodeId[],
          primaryNodeId: primaryNode?.id as MindmapNodeId | undefined,
          canEditBranch: Boolean(mindmapTreeId && mindmapTree),
          branchColor: readMindmapBranchValue((branch) => branch.color),
          branchLine: readMindmapBranchValue((branch) => branch.line),
          branchWidth: readMindmapBranchValue((branch) => branch.width),
          branchStroke: readMindmapBranchValue((branch) => branch.stroke),
          canEditBorder: true,
          borderKind: readUniformValue(nodes, (entry) => {
            const value = readString(entry, 'frameKind')
            return value === 'ellipse' || value === 'rect' || value === 'underline'
              ? value
              : undefined
          })
        }
      : undefined
  }
}

const readEdgeScope = ({
  edges,
  edgeIds,
  primaryEdge,
  defaults
}: {
  edges: readonly Edge[]
  edgeIds: readonly string[]
  primaryEdge?: Edge
  defaults: EditorDefaults['selection']
}): SelectionToolbarEdgeScope => ({
    edgeIds,
    edges,
    primaryEdgeId: primaryEdge?.id,
    single: edgeIds.length === 1,
    lock:
      edgeIds.length === 0
        ? 'none'
        : edges.every((edge) => edge.locked)
          ? 'all'
          : edges.some((edge) => edge.locked)
            ? 'mixed'
            : 'none',
    type: readUniformValue(edges, (entry) => entry.type),
    color: readUniformValue(edges, (entry) => entry.style?.color ?? defaults.edge.color),
    opacity: readUniformValue(edges, (entry) => entry.style?.opacity ?? 1),
    width: readUniformValue(edges, (entry) => entry.style?.width ?? defaults.edge.width),
    dash: readUniformValue(edges, (entry) => entry.style?.dash ?? defaults.edge.dash),
    start: readUniformValue(edges, (entry) => entry.style?.start),
    end: readUniformValue(edges, (entry) => entry.style?.end),
    textMode: readUniformValue(edges, (entry) => entry.textMode ?? defaults.edge.textMode),
    labelCount: primaryEdge?.labels?.length ?? 0
  })

const filterNodesByIds = (
  nodes: readonly Node[],
  ids: readonly string[]
) => {
  const allowed = new Set(ids)
  return nodes.filter((node) => allowed.has(node.id))
}

const filterEdgesByIds = (
  edges: readonly Edge[],
  ids: readonly string[]
) => {
  const allowed = new Set(ids)
  return edges.filter((edge) => allowed.has(edge.id))
}

const createSelectionTarget = ({
  nodeIds = [],
  edgeIds = []
}: {
  nodeIds?: readonly string[]
  edgeIds?: readonly string[]
}): SelectionTarget => ({
    nodeIds,
    edgeIds
  })

const readSelectionToolbarLockState = (
  nodeStats: SelectionNodeStats,
  edgeCount: number
): SelectionToolbarLockState => {
  if (nodeStats.count === 0 && edgeCount === 0) {
    return 'none'
  }

  if (nodeStats.count === 0) {
    return 'none'
  }

  return nodeStats.lock
}

const isSelectionNodeInfoEqual = (
  left: SelectionNodeInfo | undefined,
  right: SelectionNodeInfo | undefined
) => {
  if (!left || !right) {
    return left === right
  }

  return (
    left.lock === right.lock
    && left.types.length === right.types.length
    && left.types.every((entry, index) => {
      const other = right.types[index]
      return Boolean(other)
        && entry.key === other.key
        && entry.name === other.name
        && entry.family === other.family
        && entry.icon === other.icon
        && entry.count === other.count
        && entry.nodeIds.length === other.nodeIds.length
        && entry.nodeIds.every((nodeId, nodeIndex) => nodeId === other.nodeIds[nodeIndex])
    })
  )
}

const readSelectionNodeInfo = ({
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

const resolveSelectionOverlay = ({
  summary,
  affordance,
  tool,
  edit,
  interactionChrome,
  transforming
}: {
  summary: SelectionSummary
  affordance: SelectionAffordance
  tool: Tool
  edit: EditSession
  interactionChrome: boolean
  transforming: boolean
}): SelectionOverlay | undefined => {
  if (summary.items.count === 0 || summary.items.nodeCount === 0) {
    return undefined
  }

  const box = affordance.displayBox
  if (!box) {
    return undefined
  }

  const editing = edit !== null
  const hasResizeHandles = Boolean(
    affordance.transformPlan?.handles.some((handle) => handle.visible && handle.enabled)
  )
  const hasTransformChrome = hasResizeHandles || affordance.canRotate
  const showTransformHandles =
    tool.type === 'select'
    && !editing
    && hasTransformChrome
    && (transforming || interactionChrome)

  return affordance.showSingleNodeOverlay && affordance.ownerNodeId
    ? {
        kind: 'node',
        nodeId: affordance.ownerNodeId,
        handles: showTransformHandles
      }
    : {
        kind: 'selection',
        box,
        interactive:
          affordance.canMove
          && affordance.moveHit === 'body',
        frame: affordance.owner !== 'none',
        handles:
          showTransformHandles
          && hasResizeHandles,
        transformPlan: affordance.transformPlan
      }
}

const isEdgeEditingInteraction = (
  mode: ReturnType<EditorInputState['mode']['get']>
) => (
  mode === 'edge-drag'
  || mode === 'edge-label'
  || mode === 'edge-connect'
  || mode === 'edge-route'
)

const resolveSelectionToolbar = ({
  summary,
  affordance,
  registry,
  mindmap,
  tool,
  edit,
  interactionChrome,
  interactionMode,
  defaults
}: {
  summary: SelectionSummary
  affordance: SelectionAffordance
  registry: Pick<NodeRegistry, 'get'>
  mindmap: Pick<MindmapPresentationRead, 'tree'>
  tool: Tool
  edit: EditSession
  interactionChrome: boolean
  interactionMode: ReturnType<EditorInputState['mode']['get']>
  defaults: EditorDefaults['selection']
}): SelectionToolbarContext | undefined => {
  const box = affordance.displayBox
  if (!box) {
    return undefined
  }

  if (
    summary.items.count === 0
    || tool.type !== 'select'
    || !interactionChrome
    || edit?.kind === 'edge-label'
    || isEdgeEditingInteraction(interactionMode)
  ) {
    return undefined
  }

  const nodeStats = readSelectionNodeStats({
    summary,
    registry
  })
  const edgeStats = readSelectionEdgeStats(summary)
  const scopes: SelectionToolbarScope[] = []

  if (nodeStats.count > 0) {
    scopes.push({
      key: 'nodes',
      kind: 'nodes',
      label: readNodeCountLabel(nodeStats.count),
      count: nodeStats.count,
      target: createSelectionTarget({
        nodeIds: nodeStats.ids
      }),
      icon:
        nodeStats.types.length === 1
          ? nodeStats.types[0]?.icon
          : 'shape',
      node: readNodeScope({
        nodes: summary.items.nodes,
        nodeIds: nodeStats.ids,
        primaryNode: summary.items.primaryNode,
        registry,
        nodeStats,
        mindmap,
        defaults
      })
    })

    if (nodeStats.types.length > 1) {
      nodeStats.types.forEach((type) => {
        const scopedNodes = filterNodesByIds(summary.items.nodes, type.nodeIds)

        scopes.push({
          key: `node-type:${type.key}`,
          kind: 'node-type',
          label: `${type.name} (${type.count})`,
          count: type.count,
          target: createSelectionTarget({
            nodeIds: type.nodeIds
          }),
          icon: type.icon,
          node: readNodeScope({
            nodes: scopedNodes,
            nodeIds: type.nodeIds,
            primaryNode: scopedNodes[0],
            registry,
            nodeStats: {
              ids: type.nodeIds,
              count: type.count,
              hasGroup: scopedNodes.some((node) => Boolean(node.groupId)),
              lock:
                scopedNodes.length === 0
                  ? 'none'
                  : scopedNodes.every((node) => node.locked)
                    ? 'all'
                    : scopedNodes.some((node) => node.locked)
                      ? 'mixed'
                      : 'none',
              types: [type]
            },
            mindmap,
            defaults
          })
        })
      })
    }
  }

  if (edgeStats.count > 0) {
    scopes.push({
      key: 'edges',
      kind: 'edges',
      label: readEdgeCountLabel(edgeStats.count),
      count: edgeStats.count,
      target: createSelectionTarget({
        edgeIds: edgeStats.ids
      }),
      edge: readEdgeScope({
        edges: summary.items.edges,
        edgeIds: edgeStats.ids,
        primaryEdge: summary.items.primaryEdge,
        defaults
      })
    })

    if (edgeStats.types.length > 1) {
      edgeStats.types.forEach((type) => {
        const scopedEdges = filterEdgesByIds(summary.items.edges, type.edgeIds)

        scopes.push({
          key: `edge-type:${type.key}`,
          kind: 'edge-type',
          label: `${type.name} (${type.count})`,
          count: type.count,
          target: createSelectionTarget({
            edgeIds: type.edgeIds
          }),
          edgeType: type.edgeType,
          edge: readEdgeScope({
            edges: scopedEdges,
            edgeIds: type.edgeIds,
            primaryEdge: scopedEdges[0],
            defaults
          })
        })
      })
    }
  }

  const defaultScopeKey = nodeStats.count > 0 ? 'nodes' : 'edges'
  const selectionKind = summary.items.nodeCount > 0 && summary.items.edgeCount > 0
    ? 'mixed'
    : summary.items.nodeCount > 0
      ? 'nodes'
      : 'edges'

  return {
    box,
    key: `${summary.target.nodeIds.join('\0')}\u0001${summary.target.edgeIds.join('\0')}`,
    selectionKind,
    target: createSelectionTarget({
      nodeIds: summary.target.nodeIds,
      edgeIds: summary.target.edgeIds
    }),
    nodes: summary.items.nodes,
    edges: summary.items.edges,
    scopes,
    defaultScopeKey,
    locked: readSelectionToolbarLockState(nodeStats, edgeStats.count)
  }
}

export const createSelectionRead = ({
  model,
  registry,
  mindmap,
  tool,
  edit,
  interaction,
  defaults
}: {
  model: SelectionModelRead
  registry: Pick<NodeRegistry, 'get'>
  mindmap: Pick<MindmapPresentationRead, 'tree'>
  tool: ReadStore<Tool>
  edit: ReadStore<EditSession>
  interaction: Pick<EditorInputState, 'mode' | 'chrome'>
  defaults: EditorDefaults['selection']
}): SelectionRead => {
  const box = createDerivedStore<Rect | undefined>({
    get: () => read(model).summary.box,
    isEqual: isSameOptionalRectTuple
  })

  const nodeInfo = createDerivedStore<SelectionNodeInfo | undefined>({
    get: () => readSelectionNodeInfo({
      summary: read(model).summary,
      registry
    }),
    isEqual: isSelectionNodeInfoEqual
  })

  const overlay = createDerivedStore<SelectionOverlay | undefined>({
    get: () => {
      const resolvedModel = read(model)

      return resolveSelectionOverlay({
        summary: resolvedModel.summary,
        affordance: resolvedModel.affordance,
        tool: read(tool),
        edit: read(edit),
        interactionChrome: read(interaction.chrome),
        transforming: read(interaction.mode) === 'node-transform'
      })
    }
  })

  const toolbar = createDerivedStore<SelectionToolbarContext | undefined>({
    get: () => {
      const resolvedModel = read(model)

      return resolveSelectionToolbar({
        summary: resolvedModel.summary,
        affordance: resolvedModel.affordance,
        registry,
        mindmap,
        tool: read(tool),
        edit: read(edit),
        interactionChrome: read(interaction.chrome),
        interactionMode: read(interaction.mode),
        defaults
      })
    }
  })

  return {
    box,
    node: nodeInfo,
    overlay,
    toolbar
  }
}

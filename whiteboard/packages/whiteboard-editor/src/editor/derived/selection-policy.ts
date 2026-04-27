import { path as mutationPath } from '@shared/mutation'
import type { MindmapStructure } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import {
  type SelectionAffordance,
  type SelectionSummary,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { Edge, EdgeId, MindmapId, MindmapNodeId, NodeId, NodeModel } from '@whiteboard/core/types'
import { collection, equal } from '@shared/core'
import type { EditorDefaults, EditorNodePaintDefaults } from '@whiteboard/editor/types/defaults'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type {
  SelectionEdgeStats,
  SelectionMembers,
  SelectionNodeStats,
  SelectionOverlay,
  SelectionToolbarContext,
  SelectionToolbarEdgeScope,
  SelectionToolbarLockState,
  SelectionToolbarNodeKind,
  SelectionToolbarNodeScope,
  SelectionToolbarScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'

const readNodeCountLabel = (
  count: number
) => count === 1 ? '1 node' : `${count} nodes`

const readEdgeCountLabel = (
  count: number
) => count === 1 ? '1 edge' : `${count} edges`

const readString = (
  node: NodeModel,
  key: string
) => {
  const value = node.style?.[key]
  return typeof value === 'string' ? value : undefined
}

const readNumber = (
  node: NodeModel,
  key: string
) => {
  const value = node.style?.[key]
  return typeof value === 'number' ? value : undefined
}

const readNumberArray = (
  node: NodeModel,
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

const resolveToolbarNodeKind = (
  nodes: readonly NodeModel[],
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
  nodes: readonly NodeModel[],
  nodeType: Pick<NodeTypeSupport, 'hasControl'>,
  control: 'fill' | 'stroke' | 'text'
) => nodes.every((node) => nodeType.hasControl(node, control))

const readDefaultFill = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.fill

const readFill = (
  node: NodeModel,
  defaults: EditorNodePaintDefaults | undefined
) => readString(node, 'fill') ?? readDefaultFill(defaults)

const readFillOpacity = (
  node: NodeModel
) => readNumber(node, 'fillOpacity')
  ?? (node.type === 'shape' ? 1 : undefined)

const readDefaultStroke = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.stroke

const readStroke = (
  node: NodeModel,
  defaults: EditorNodePaintDefaults | undefined
) => readString(node, 'stroke') ?? readDefaultStroke(defaults)

const readDefaultStrokeWidth = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.strokeWidth

const readStrokeWidth = (
  node: NodeModel,
  defaults: EditorNodePaintDefaults | undefined
) => readNumber(node, 'strokeWidth') ?? readDefaultStrokeWidth(defaults)

const readStrokeOpacity = (
  node: NodeModel
) => readNumber(node, 'strokeOpacity')
  ?? (node.type === 'shape' ? 1 : undefined)

const readOpacity = (
  node: NodeModel
) => readNumber(node, 'opacity') ?? 1

const readStrokeDash = (
  node: NodeModel
) => readNumberArray(node, 'strokeDash')

const readDefaultTextColor = (
  defaults: EditorNodePaintDefaults | undefined
) => defaults?.color

const readTextColor = (
  node: NodeModel,
  defaults: EditorNodePaintDefaults | undefined
) => readString(node, 'color') ?? readDefaultTextColor(defaults)

const readFontSize = (
  node: NodeModel
) => readNumber(node, 'fontSize') ?? nodeApi.text.defaultFontSize

const readFontWeight = (
  node: NodeModel
) => readNumber(node, 'fontWeight') ?? 400

const readFontStyle = (
  node: NodeModel
) => readString(node, 'fontStyle') === 'italic'
  ? 'italic'
  : 'normal'

const readTextAlign = (
  node: NodeModel
) => {
  const value = readString(node, 'textAlign')
  if (value === 'left' || value === 'right' || value === 'center') {
    return value
  }

  return node.type === 'shape' ? 'center' : 'left'
}

const readToolbarValue = <TValue,>(
  enabled: boolean,
  nodes: readonly NodeModel[],
  readValue: (node: NodeModel) => TValue,
  compare?: (left: TValue, right: TValue) => boolean
) => enabled
  ? collection.uniform(nodes, readValue, compare)
  : undefined

export const readNodeScope = ({
  nodes,
  nodeIds,
  primaryNode,
  nodeType,
  nodeStats,
  readMindmapStructure,
  defaults
}: {
  nodes: readonly NodeModel[]
  nodeIds: readonly NodeId[]
  primaryNode?: NodeModel
  nodeType: Pick<NodeTypeSupport, 'hasControl' | 'supportsStyle'>
  nodeStats: SelectionNodeStats
  readMindmapStructure: (id: MindmapId) => MindmapStructure | undefined
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
  const canEditFill = hasControl(nodes, nodeType, 'fill')
  const canEditStroke = hasControl(nodes, nodeType, 'stroke')
  const canEditTextColor = hasControl(nodes, nodeType, 'text')
    && nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('color'), 'string'))
  const styleSupport = {
    fontSize: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('fontSize'), 'number')),
    fontWeight: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('fontWeight'), 'number')),
    fontStyle: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('fontStyle'), 'string')),
    textAlign: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('textAlign'), 'string')),
    fillOpacity: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('fillOpacity'), 'number')),
    strokeOpacity: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('strokeOpacity'), 'number')),
    strokeDash: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('strokeDash'), 'numberArray')),
    opacity: nodes.every((node) => nodeType.supportsStyle(node, mutationPath.of('opacity'), 'number'))
  }
  const canEditFillOpacity = canEditFill && styleSupport.fillOpacity
  const canEditStrokeOpacity = canEditStroke && styleSupport.strokeOpacity
  const canEditStrokeDash = canEditStroke && styleSupport.strokeDash
  const mindmapOwned = nodes.length > 0
    && nodes.every((entry) => entry.type === 'text' && entry.owner?.kind === 'mindmap')
  const treeIds = mindmapOwned
    ? [...new Set(nodes.map((entry) => entry.owner?.kind === 'mindmap' ? entry.owner.id : undefined).filter(Boolean))]
    : []
  const mindmapTreeId = treeIds.length === 1
    ? treeIds[0]
    : undefined
  const mindmapTree = mindmapTreeId
    ? readMindmapStructure(mindmapTreeId)?.tree
    : undefined
  const readMindmapBranchValue = <TValue,>(
    select: (branch: NonNullable<typeof mindmapTree>['nodes'][MindmapNodeId]['branch']) => TValue
  ) => (
    mindmapTreeId && mindmapTree
      ? collection.uniform(
          nodeIds,
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
        ? nodeApi.shape.kind(primaryNode)
        : undefined,
    shapeKindValue:
      nodeKind === 'shape'
        ? collection.uniform(nodes, nodeApi.shape.kind)
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
    stroke: collection.uniform(nodes, (node) => readStroke(node, readPaintDefaults(node))),
    strokeWidth: collection.uniform(nodes, (node) => readStrokeWidth(node, readPaintDefaults(node))),
    strokeOpacity: readToolbarValue(canEditStrokeOpacity, nodes, readStrokeOpacity),
    strokeDash: readToolbarValue(
      canEditStrokeDash,
      nodes,
      readStrokeDash,
      (left, right) => equal.sameOptionalNumberArray(
        normalizeDash(left),
        normalizeDash(right)
      )
    ),
    opacity: readToolbarValue(styleSupport.opacity, nodes, readOpacity),
    mindmap: mindmapOwned
      ? {
          treeId: mindmapTreeId,
          nodeIds,
          primaryNodeId: primaryNode?.id,
          canEditBranch: Boolean(mindmapTreeId && mindmapTree),
          branchColor: readMindmapBranchValue((branch) => branch.color),
          branchLine: readMindmapBranchValue((branch) => branch.line),
          branchWidth: readMindmapBranchValue((branch) => branch.width),
          branchStroke: readMindmapBranchValue((branch) => branch.stroke),
          canEditBorder: true,
          borderKind: collection.uniform(nodes, (entry) => {
            const value = readString(entry, 'frameKind')
            return value === 'ellipse' || value === 'rect' || value === 'underline'
              ? value
              : undefined
          })
        }
      : undefined
  }
}

export const readEdgeScope = ({
  edges,
  edgeIds,
  primaryEdge,
  defaults
}: {
  edges: readonly Edge[]
  edgeIds: readonly EdgeId[]
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
  type: collection.uniform(edges, (entry) => entry.type),
  color: collection.uniform(edges, (entry) => entry.style?.color ?? defaults.edge.color),
  opacity: collection.uniform(edges, (entry) => entry.style?.opacity ?? 1),
  width: collection.uniform(edges, (entry) => entry.style?.width ?? defaults.edge.width),
  dash: collection.uniform(edges, (entry) => entry.style?.dash ?? defaults.edge.dash),
  start: collection.uniform(edges, (entry) => entry.style?.start),
  end: collection.uniform(edges, (entry) => entry.style?.end),
  textMode: collection.uniform(edges, (entry) => entry.textMode ?? defaults.edge.textMode),
  labelCount: primaryEdge?.labels?.length ?? 0
})

const createSelectionTarget = ({
  nodeIds = [],
  edgeIds = []
}: {
  nodeIds?: readonly NodeId[]
  edgeIds?: readonly EdgeId[]
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

export const resolveSelectionOverlay = ({
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

const collectNodesByIds = (
  nodeById: ReadonlyMap<NodeId, NodeModel>,
  ids: readonly NodeId[]
): NodeModel[] => ids.flatMap((id) => {
  const node = nodeById.get(id)
  return node ? [node] : []
})

const collectEdgesByIds = (
  edgeById: ReadonlyMap<EdgeId, Edge>,
  ids: readonly EdgeId[]
): Edge[] => ids.flatMap((id) => {
  const edge = edgeById.get(id)
  return edge ? [edge] : []
})

export const resolveSelectionToolbar = ({
  members,
  summary,
  affordance,
  nodeStats,
  edgeStats,
  nodeScope,
  edgeScope,
  nodeType,
  readMindmapStructure,
  tool,
  edit,
  interactionChrome,
  editingEdge,
  defaults
}: {
  members: SelectionMembers
  summary: SelectionSummary
  affordance: SelectionAffordance
  nodeStats: SelectionNodeStats
  edgeStats: SelectionEdgeStats
  nodeScope: SelectionToolbarNodeScope | undefined
  edgeScope: SelectionToolbarEdgeScope | undefined
  nodeType: Pick<NodeTypeSupport, 'hasControl' | 'supportsStyle'>
  readMindmapStructure: (id: MindmapId) => MindmapStructure | undefined
  tool: Tool
  edit: EditSession
  interactionChrome: boolean
  editingEdge: boolean
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
    || editingEdge
  ) {
    return undefined
  }

  const scopes: SelectionToolbarScope[] = []
  const nodeById = new Map<NodeId, NodeModel>()
  members.nodes.forEach((node) => {
    nodeById.set(node.id, node)
  })
  const edgeById = new Map<EdgeId, Edge>()
  members.edges.forEach((edge) => {
    edgeById.set(edge.id, edge)
  })

  if (nodeStats.count > 0 && nodeScope) {
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
      node: nodeScope
    })

    if (nodeStats.types.length > 1) {
      nodeStats.types.forEach((type) => {
        const scopedNodes = collectNodesByIds(nodeById, type.nodeIds)

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
            nodeType,
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
            readMindmapStructure,
            defaults
          })
        })
      })
    }
  }

  if (edgeStats.count > 0 && edgeScope) {
    scopes.push({
      key: 'edges',
      kind: 'edges',
      label: readEdgeCountLabel(edgeStats.count),
      count: edgeStats.count,
      target: createSelectionTarget({
        edgeIds: edgeStats.ids
      }),
      edge: edgeScope
    })

    if (edgeStats.types.length > 1) {
      edgeStats.types.forEach((type) => {
        const scopedEdges = collectEdgesByIds(edgeById, type.edgeIds)

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
    key: members.key,
    selectionKind,
    target: members.target,
    nodes: members.nodes,
    edges: members.edges,
    scopes,
    defaultScopeKey,
    locked: readSelectionToolbarLockState(nodeStats, edgeStats.count)
  }
}

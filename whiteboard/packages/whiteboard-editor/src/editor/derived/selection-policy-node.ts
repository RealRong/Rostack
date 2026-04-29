import type { MindmapStructure } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import type { MindmapId, MindmapNodeId, NodeId, NodeModel } from '@whiteboard/core/types'
import { collection, equal } from '@shared/core'
import type { EditorDefaults, EditorNodePaintDefaults } from '@whiteboard/editor/types/defaults'
import type {
  SelectionNodeStats,
  SelectionToolbarNodeKind,
  SelectionToolbarNodeScope
} from '@whiteboard/editor/types/selectionPresentation'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'

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
    && nodes.every((node) => nodeType.supportsStyle(node, 'style.color', 'string'))
  const styleSupport = {
    fontSize: nodes.every((node) => nodeType.supportsStyle(node, 'style.fontSize', 'number')),
    fontWeight: nodes.every((node) => nodeType.supportsStyle(node, 'style.fontWeight', 'number')),
    fontStyle: nodes.every((node) => nodeType.supportsStyle(node, 'style.fontStyle', 'string')),
    textAlign: nodes.every((node) => nodeType.supportsStyle(node, 'style.textAlign', 'string')),
    fillOpacity: nodes.every((node) => nodeType.supportsStyle(node, 'style.fillOpacity', 'number')),
    strokeOpacity: nodes.every((node) => nodeType.supportsStyle(node, 'style.strokeOpacity', 'number')),
    strokeDash: nodes.every((node) => nodeType.supportsStyle(node, 'style.strokeDash', 'numberArray')),
    opacity: nodes.every((node) => nodeType.supportsStyle(node, 'style.opacity', 'number'))
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

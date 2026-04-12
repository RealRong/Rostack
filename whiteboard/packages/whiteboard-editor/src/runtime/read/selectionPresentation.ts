import {
  FRAME_DEFAULT_FILL,
  FRAME_DEFAULT_STROKE,
  FRAME_DEFAULT_STROKE_WIDTH,
  FRAME_DEFAULT_TEXT_COLOR,
  STICKY_DEFAULT_FILL,
  STICKY_DEFAULT_TEXT_COLOR,
  TEXT_DEFAULT_FONT_SIZE,
  readShapeKind,
  readShapeSpec,
  type ShapeKind
} from '@whiteboard/core/node'
import { sameOptionalNumberArray as isSameOptionalNumberArray } from '@shared/core'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTransformBox
} from '@whiteboard/core/selection'
import type { Node, NodeSchema, Rect } from '@whiteboard/core/types'
import type {
  SelectionOverlay,
  NodeToolbarContext,
  ToolbarSelectionKind
} from '../../selection'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { EditSession } from '../state/edit'
import { readSelectionNodeStats } from '../../selection/nodeSummary'
import { readUniformValue } from './utils'

type StyleFieldKind = 'string' | 'number' | 'numberArray'

const UI_TEXT_PRIMARY = 'var(--ui-text-primary)'

const readObjectCountLabel = (
  count: number
) => count === 1 ? '1 object' : `${count} objects`

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

const readShapeDefaults = (
  node: Node
) => node.type === 'shape'
  ? readShapeSpec(readShapeKind(node)).defaults
  : undefined

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

const resolveToolbarSelectionKind = (
  nodes: readonly Node[],
  summary: ReturnType<typeof readSelectionNodeStats>
): ToolbarSelectionKind => {
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
) => nodes.every((node) => {
  const definition = registry.get(node.type)
  const meta = definition?.describe?.(node) ?? definition?.meta
  return meta?.controls.includes(control) ?? false
})

const readDefaultFill = (
  node: Node
) => readShapeDefaults(node)?.fill
  ?? (node.type === 'sticky'
    ? STICKY_DEFAULT_FILL
    : node.type === 'frame'
      ? FRAME_DEFAULT_FILL
      : undefined)

const readFill = (
  node: Node
) => readString(node, 'fill') ?? readDefaultFill(node)

const readFillOpacity = (
  node: Node
) => readNumber(node, 'fillOpacity')
  ?? (node.type === 'shape' ? 1 : undefined)

const readDefaultStroke = (
  node: Node
) => readShapeDefaults(node)?.stroke
  ?? (node.type === 'frame'
    ? FRAME_DEFAULT_STROKE
    : node.type === 'draw'
      ? UI_TEXT_PRIMARY
      : undefined)

const readStroke = (
  node: Node
) => readString(node, 'stroke') ?? readDefaultStroke(node)

const readDefaultStrokeWidth = (
  node: Node
) => node.type === 'shape'
  ? 1
  : node.type === 'frame'
    ? FRAME_DEFAULT_STROKE_WIDTH
    : node.type === 'draw'
      ? 2
      : undefined

const readStrokeWidth = (
  node: Node
) => readNumber(node, 'strokeWidth') ?? readDefaultStrokeWidth(node)

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
  node: Node
) => readShapeDefaults(node)?.color
  ?? (node.type === 'sticky'
    ? STICKY_DEFAULT_TEXT_COLOR
    : node.type === 'frame'
      ? FRAME_DEFAULT_TEXT_COLOR
      : node.type === 'text'
        ? UI_TEXT_PRIMARY
        : undefined)

const readTextColor = (
  node: Node
) => readString(node, 'color') ?? readDefaultTextColor(node)

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
  read: (node: Node) => TValue,
  equal?: (left: TValue, right: TValue) => boolean
) => enabled
  ? readUniformValue(nodes, read, equal)
  : undefined

const resolveToolbarContext = ({
  summary,
  box,
  registry
}: {
  summary: SelectionSummary
  box: Rect
  registry: Pick<NodeRegistry, 'get'>
}): NodeToolbarContext | undefined => {
  const nodes = summary.items.nodes
  if (!nodes.length || summary.items.edgeCount > 0) {
    return undefined
  }

  const nodeSummary = readSelectionNodeStats({
    summary,
    registry
  })
  const selectionKind = resolveToolbarSelectionKind(nodes, nodeSummary)
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

  return {
    box,
    key: nodes.map((node) => node.id).join('\0'),
    kind: selectionKind,
    nodeIds: nodeSummary.ids,
    nodes,
    primaryNode: summary.items.primaryNode,
    filter:
      nodeSummary.count > 1 && nodeSummary.types.length > 1
        ? {
            label: readObjectCountLabel(nodeSummary.count),
            types: nodeSummary.types
          }
        : undefined,
    canChangeShapeKind: selectionKind === 'shape',
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
      selectionKind === 'shape' && summary.items.primaryNode
        ? readShapeKind(summary.items.primaryNode)
        : undefined,
    shapeKindValue:
      selectionKind === 'shape'
        ? readUniformValue(nodes, readShapeKind)
        : undefined,
    fontSize: readToolbarValue(styleSupport.fontSize, nodes, readFontSize),
    fontWeight: readToolbarValue(styleSupport.fontWeight, nodes, readFontWeight),
    fontStyle: readToolbarValue(styleSupport.fontStyle, nodes, readFontStyle),
    textAlign: readToolbarValue(styleSupport.textAlign, nodes, readTextAlign),
    textColor: readToolbarValue(canEditTextColor, nodes, readTextColor),
    fill: readToolbarValue(canEditFill, nodes, readFill),
    fillOpacity: readToolbarValue(canEditFillOpacity, nodes, readFillOpacity),
    stroke: readToolbarValue(canEditStroke, nodes, readStroke),
    strokeWidth: readToolbarValue(canEditStroke, nodes, readStrokeWidth),
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
    locked: nodeSummary.lock
  }
}

export const resolveSelectionOverlay = ({
  summary,
  transformBox,
  affordance,
  tool,
  edit,
  interactionChrome,
  transforming
}: {
  summary: SelectionSummary
  transformBox: SelectionTransformBox
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
  const hasTransformChrome = affordance.canResize || affordance.canRotate
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
        transformBox: affordance.transformBox ?? transformBox.box,
        interactive:
          affordance.canMove
          && affordance.moveHit === 'body',
        frame: affordance.owner !== 'none',
        handles:
          showTransformHandles
          && Boolean(affordance.transformBox ?? transformBox.box)
          && affordance.canResize,
        canResize: affordance.canResize
      }
}

export const resolveSelectionToolbar = ({
  summary,
  affordance,
  registry,
  tool,
  edit,
  interactionChrome
}: {
  summary: SelectionSummary
  affordance: SelectionAffordance
  registry: Pick<NodeRegistry, 'get'>
  tool: Tool
  edit: EditSession
  interactionChrome: boolean
}): NodeToolbarContext | undefined => {
  const box = affordance.displayBox
  if (!box) {
    return undefined
  }

  const pureNodeSelection =
    summary.items.nodeCount > 0
    && summary.items.edgeCount === 0
  if (
    !pureNodeSelection
    || tool.type !== 'select'
    || !interactionChrome
  ) {
    return undefined
  }

  return resolveToolbarContext({
    summary,
    box,
    registry
  })
}

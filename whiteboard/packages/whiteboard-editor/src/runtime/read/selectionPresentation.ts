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
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTransformBox
} from '@whiteboard/core/selection'
import type { Node, NodeSchema, Rect } from '@whiteboard/core/types'
import type {
  SelectionPresentation,
  SelectionToolbarContext,
  ToolbarSelectionKind
} from '../../selection'
import type { NodeRegistry } from '../../types/node'
import type { Tool } from '../../types/tool'
import type { EditTarget } from '../state/edit'
import { readSelectionNodeSummary } from '../../selection'

type StyleFieldKind = 'string' | 'number' | 'numberArray'

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

const isDashEqual = (
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
) => {
  const normalizedLeft = left?.length ? left : undefined
  const normalizedRight = right?.length ? right : undefined

  if (!normalizedLeft && !normalizedRight) {
    return true
  }
  if (!normalizedLeft || !normalizedRight || normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

const readUniformValue = <TValue,>(
  nodes: readonly Node[],
  read: (node: Node) => TValue,
  equal: (left: TValue, right: TValue) => boolean = Object.is
): TValue | undefined => {
  if (!nodes.length) {
    return undefined
  }

  const first = read(nodes[0]!)
  return nodes.every((node) => equal(first, read(node)))
    ? first
    : undefined
}

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
  summary: ReturnType<typeof readSelectionNodeSummary>
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

const readFill = (
  node: Node
) => {
  if (node.type === 'shape') {
    return readString(node, 'fill') ?? readShapeSpec(readShapeKind(node)).defaults.fill
  }
  if (node.type === 'sticky') {
    return readString(node, 'fill')
      ?? (
        node.data && typeof node.data.background === 'string'
          ? node.data.background
          : STICKY_DEFAULT_FILL
      )
  }
  if (node.type === 'frame') {
    return readString(node, 'fill') ?? FRAME_DEFAULT_FILL
  }

  return readString(node, 'fill')
}

const readFillOpacity = (
  node: Node
) => {
  if (node.type === 'shape') {
    return readNumber(node, 'fillOpacity') ?? 1
  }

  return readNumber(node, 'fillOpacity')
}

const readStroke = (
  node: Node
) => {
  if (node.type === 'shape') {
    return readString(node, 'stroke') ?? readShapeSpec(readShapeKind(node)).defaults.stroke
  }
  if (node.type === 'frame') {
    return readString(node, 'stroke') ?? FRAME_DEFAULT_STROKE
  }
  if (node.type === 'draw') {
    return readString(node, 'stroke') ?? 'var(--ui-text-primary)'
  }

  return readString(node, 'stroke')
}

const readStrokeWidth = (
  node: Node
) => {
  if (node.type === 'shape') {
    return readNumber(node, 'strokeWidth') ?? 1
  }
  if (node.type === 'frame') {
    return readNumber(node, 'strokeWidth') ?? FRAME_DEFAULT_STROKE_WIDTH
  }
  if (node.type === 'draw') {
    return readNumber(node, 'strokeWidth') ?? 2
  }

  return readNumber(node, 'strokeWidth')
}

const readStrokeOpacity = (
  node: Node
) => {
  if (node.type === 'shape') {
    return readNumber(node, 'strokeOpacity') ?? 1
  }

  return readNumber(node, 'strokeOpacity')
}

const readOpacity = (
  node: Node
) => readNumber(node, 'opacity') ?? 1

const readStrokeDash = (
  node: Node
) => readNumberArray(node, 'strokeDash')

const readTextColor = (
  node: Node
) => {
  if (node.type === 'shape') {
    return readString(node, 'color') ?? readShapeSpec(readShapeKind(node)).defaults.color
  }
  if (node.type === 'sticky') {
    return readString(node, 'color') ?? STICKY_DEFAULT_TEXT_COLOR
  }
  if (node.type === 'frame') {
    return readString(node, 'color') ?? FRAME_DEFAULT_TEXT_COLOR
  }
  if (node.type === 'text') {
    return readString(node, 'color') ?? 'var(--ui-text-primary)'
  }

  return readString(node, 'color')
}

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

const resolvePresentationKind = ({
  summary,
  nodeSummary
}: {
  summary: SelectionSummary
  nodeSummary: ReturnType<typeof readSelectionNodeSummary>
}): Exclude<SelectionPresentation, { kind: 'none' }>['kind'] => {
  if (
    nodeSummary.count === 1
    && nodeSummary.types.length === 1
    && nodeSummary.types[0]?.key === 'group'
    && summary.items.edgeCount === 0
  ) {
    return 'group'
  }

  if (summary.items.edgeCount > 0) {
    return 'mixed'
  }

  return summary.items.nodeCount === 1 ? 'node' : 'nodes'
}

const resolveToolbarContext = ({
  summary,
  box,
  registry
}: {
  summary: SelectionSummary
  box: Rect
  registry: Pick<NodeRegistry, 'get'>
}): SelectionToolbarContext | undefined => {
  const nodes = summary.items.nodes
  if (!nodes.length || summary.items.edgeCount > 0) {
    return undefined
  }

  const nodeSummary = readSelectionNodeSummary({
    summary,
    registry
  })
  const selectionKind = resolveToolbarSelectionKind(nodes, nodeSummary)
  const canEditFill = hasControl(nodes, registry, 'fill')
  const canEditStroke = hasControl(nodes, registry, 'stroke')
  const canEditTextColor = hasControl(nodes, registry, 'text')
    && supportsStyleField(nodes, registry, 'color', 'string')

  return {
    selectionKey: nodes.map((node) => node.id).join('\0'),
    selectionKind,
    nodeIds: nodeSummary.ids,
    nodes,
    nodeSummary,
    primaryNode: summary.items.primaryNode,
    filter:
      nodeSummary.count > 1 && nodeSummary.types.length > 1
        ? {
            label: readObjectCountLabel(nodeSummary.count),
            types: nodeSummary.types
          }
        : undefined,
    canChangeShapeKind: selectionKind === 'shape',
    canEditFontSize: supportsStyleField(nodes, registry, 'fontSize', 'number'),
    canEditFontWeight: supportsStyleField(nodes, registry, 'fontWeight', 'number'),
    canEditFontStyle: supportsStyleField(nodes, registry, 'fontStyle', 'string'),
    canEditTextAlign: supportsStyleField(nodes, registry, 'textAlign', 'string'),
    canEditTextColor,
    canEditFill,
    canEditFillOpacity:
      canEditFill
      && supportsStyleField(nodes, registry, 'fillOpacity', 'number'),
    canEditStroke,
    canEditStrokeOpacity:
      canEditStroke
      && supportsStyleField(nodes, registry, 'strokeOpacity', 'number'),
    canEditStrokeDash:
      canEditStroke
      && supportsStyleField(nodes, registry, 'strokeDash', 'numberArray'),
    canEditNodeOpacity: supportsStyleField(nodes, registry, 'opacity', 'number'),
    shapeKind:
      selectionKind === 'shape' && summary.items.primaryNode
        ? readShapeKind(summary.items.primaryNode)
        : undefined,
    shapeKindValue:
      selectionKind === 'shape'
        ? readUniformValue(nodes, readShapeKind)
        : undefined,
    fontSize: supportsStyleField(nodes, registry, 'fontSize', 'number')
      ? readUniformValue(nodes, readFontSize)
      : undefined,
    fontWeight: supportsStyleField(nodes, registry, 'fontWeight', 'number')
      ? readUniformValue(nodes, readFontWeight)
      : undefined,
    fontStyle: supportsStyleField(nodes, registry, 'fontStyle', 'string')
      ? readUniformValue(nodes, readFontStyle)
      : undefined,
    textAlign: supportsStyleField(nodes, registry, 'textAlign', 'string')
      ? readUniformValue(nodes, readTextAlign)
      : undefined,
    textColor: canEditTextColor
      ? readUniformValue(nodes, readTextColor)
      : undefined,
    fill: canEditFill
      ? readUniformValue(nodes, readFill)
      : undefined,
    fillOpacity:
      canEditFill
      && supportsStyleField(nodes, registry, 'fillOpacity', 'number')
        ? readUniformValue(nodes, readFillOpacity)
        : undefined,
    stroke: canEditStroke
      ? readUniformValue(nodes, readStroke)
      : undefined,
    strokeWidth: canEditStroke
      ? readUniformValue(nodes, readStrokeWidth)
      : undefined,
    strokeOpacity:
      canEditStroke
      && supportsStyleField(nodes, registry, 'strokeOpacity', 'number')
        ? readUniformValue(nodes, readStrokeOpacity)
        : undefined,
    strokeDash:
      canEditStroke
      && supportsStyleField(nodes, registry, 'strokeDash', 'numberArray')
        ? readUniformValue(nodes, readStrokeDash, isDashEqual)
        : undefined,
    opacity: supportsStyleField(nodes, registry, 'opacity', 'number')
      ? readUniformValue(nodes, readOpacity)
      : undefined,
    locked: nodeSummary.lock
  }
}

export const resolveSelectionPresentation = ({
  summary,
  transformBox,
  affordance,
  registry,
  tool,
  edit,
  interactionChrome,
  transforming
}: {
  summary: SelectionSummary
  transformBox: SelectionTransformBox
  affordance: SelectionAffordance
  registry: Pick<NodeRegistry, 'get'>
  tool: Tool
  edit: EditTarget
  interactionChrome: boolean
  transforming: boolean
}): SelectionPresentation => {
  if (summary.items.count === 0 || summary.items.nodeCount === 0) {
    return {
      kind: 'none'
    }
  }

  const box = affordance.displayBox
  if (!box) {
    return {
      kind: 'none'
    }
  }

  const editing = edit !== null
  const pureNodeSelection =
    summary.items.nodeCount > 0
    && summary.items.edgeCount === 0
  const nodeSummary = readSelectionNodeSummary({
    summary,
    registry
  })
  const hasTransformChrome = affordance.canResize || affordance.canRotate
  const showTransformHandles =
    tool.type === 'select'
    && !editing
    && hasTransformChrome
    && (transforming || interactionChrome)
  const toolbar = pureNodeSelection
    && tool.type === 'select'
    && !editing
    && interactionChrome
      ? resolveToolbarContext({
          summary,
          box,
          registry
        })
      : undefined

  return {
    kind: resolvePresentationKind({
      summary,
      nodeSummary
    }),
    geometry: {
      box,
      transformBox: affordance.transformBox ?? transformBox.box
    },
    overlay:
      affordance.showSingleNodeOverlay && affordance.ownerNodeId
        ? {
            kind: 'node',
            nodeId: affordance.ownerNodeId,
            handles: showTransformHandles
          }
        : {
            kind: 'selection',
            interactive:
              affordance.canMove
              && affordance.moveHit === 'body',
            frame: affordance.owner !== 'none',
            handles:
              showTransformHandles
              && Boolean(affordance.transformBox ?? transformBox.box)
              && affordance.canResize,
            canResize: affordance.canResize
          },
    toolbar
  }
}

import {
  FRAME_DEFAULT_FILL,
  FRAME_DEFAULT_STROKE,
  FRAME_DEFAULT_STROKE_WIDTH,
  FRAME_DEFAULT_TEXT_COLOR,
  readShapeKind,
  readShapeSpec,
  type ShapeKind
} from '@whiteboard/core/node'
import type { Node, NodeSchema, Point } from '@whiteboard/core/types'
import type { NodeSummary } from '../../../node/summary'
import {
  STICKY_DEFAULT_FILL,
  STICKY_DEFAULT_TEXT_COLOR,
  TEXT_DEFAULT_FONT_SIZE
} from '../../../node/text'
import type { SelectionMoreMenuSectionView } from '../../../node/selection'
import type {
  NodeMeta,
  NodeRegistry
} from '../../../../types/node'
import { resolveToolbarPlacement } from '../layout'
import type {
  ToolbarSelectionKind
} from './types'

type ToolbarSelectionState = {
  boxState: {
    box?: {
      x: number
      y: number
      width: number
      height: number
    }
  }
  summary: {
    items: {
      nodes: readonly Node[]
      edges: readonly unknown[]
      primaryNode?: Node
    }
  }
  nodeSummary: NodeSummary
  menu?: {
    moreSections: readonly SelectionMoreMenuSectionView[]
  }
}

type StyleFieldKind = 'string' | 'number' | 'numberArray'

export type ToolbarSummaryContext = {
  visible: boolean
  selectionKind: ToolbarSelectionKind
  selectionKey: string | null
  nodeIds: readonly string[]
  nodes: readonly Node[]
  nodeSummary: NodeSummary
  primaryNode?: Node
  placement?: 'top' | 'bottom'
  anchor?: Point
  menuSections: readonly SelectionMoreMenuSectionView[]
  canChangeShapeKind: boolean
  canEditFontSize: boolean
  canEditFontWeight: boolean
  canEditFontStyle: boolean
  canEditTextAlign: boolean
  canEditTextColor: boolean
  canEditFill: boolean
  canEditFillOpacity: boolean
  canEditStroke: boolean
  canEditStrokeOpacity: boolean
  canEditStrokeDash: boolean
  canEditNodeOpacity: boolean
  shapeKind?: ShapeKind
  shapeKindValue?: ShapeKind
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
  textColor?: string
  fill?: string
  fillOpacity?: number
  stroke?: string
  strokeWidth?: number
  strokeOpacity?: number
  strokeDash?: readonly number[]
  opacity?: number
  locked: NodeSummary['lock']
}

const EMPTY_SECTIONS: readonly SelectionMoreMenuSectionView[] = []

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

const readNodeMeta = (
  registry: Pick<NodeRegistry, 'get'>,
  node: Node
): NodeMeta | undefined => {
  const definition = registry.get(node.type)
  return definition?.describe?.(node) ?? definition?.meta
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

const resolveSelectionKind = (
  nodes: readonly Node[],
  summary: NodeSummary
): ToolbarSelectionKind => {
  if (!nodes.length) {
    return 'none'
  }
  if (nodes.every((node) => node.type === 'shape')) {
    return 'shape'
  }
  if (nodes.every((node) => node.type === 'text')) {
    return 'text'
  }
  if (nodes.every((node) => node.type === 'sticky')) {
    return 'sticky'
  }
  if (nodes.every((node) => node.type === 'frame')) {
    return 'frame'
  }
  if (nodes.every((node) => node.type === 'draw')) {
    return 'draw'
  }
  if (nodes.every((node) => node.type === 'group')) {
    return 'group'
  }

  return summary.count > 0 ? 'mixed' : 'none'
}

const hasControl = (
  nodes: readonly Node[],
  registry: Pick<NodeRegistry, 'get'>,
  control: 'fill' | 'stroke' | 'text'
) => nodes.every((node) => {
  const meta = readNodeMeta(registry, node)
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

export const resolveToolbarSummaryContext = ({
  selection,
  registry,
  worldToScreen
}: {
  selection: ToolbarSelectionState
  registry: Pick<NodeRegistry, 'get'>
  worldToScreen: (point: Point) => Point
}): ToolbarSummaryContext => {
  const rect = selection.boxState.box
  const nodes = selection.summary.items.nodes
  const edges = selection.summary.items.edges
  const nodeIds = nodes.map((node) => node.id)
  const selectionKey = nodeIds.length > 0 ? nodeIds.join('\0') : null
  const selectionKind = resolveSelectionKind(nodes, selection.nodeSummary)
  const primaryNode = selection.summary.items.primaryNode
  const canEditFill = hasControl(nodes, registry, 'fill')
  const canEditStroke = hasControl(nodes, registry, 'stroke')
  const canEditTextColor = hasControl(nodes, registry, 'text')
    && supportsStyleField(nodes, registry, 'color', 'string')
  const menuSections = (selection.menu?.moreSections ?? EMPTY_SECTIONS)
    .filter((section) => section.key !== 'state')
  const placement = rect
    ? resolveToolbarPlacement({
        worldToScreen,
        rect
      })
    : undefined

  return {
    visible:
      Boolean(rect)
      && nodes.length > 0
      && edges.length === 0,
    selectionKind,
    selectionKey,
    nodeIds,
    nodes,
    nodeSummary: selection.nodeSummary,
    primaryNode,
    placement: placement?.placement,
    anchor: placement?.anchor,
    menuSections,
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
      selectionKind === 'shape' && primaryNode
        ? readShapeKind(primaryNode)
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
    locked: selection.nodeSummary.lock
  }
}

import type { Node, NodeSchema, Point, Rect } from '@whiteboard/core/types'
import type { CSSProperties } from 'react'
import type {
  ContextMenuPlacement,
  MenuOpenSnapshot,
  ToolbarItem,
  ToolbarItemKey,
  ToolbarMenuAnchor,
  ToolbarPlacement
} from '../../../types/selection'
import type { NodeSelectionCan } from '../../node/summary'

const SAFE_MARGIN = 12
const MENU_WIDTH = 220
const TOOLBAR_VERTICAL_GAP = 12
const TOOLBAR_MIN_TOP_SPACE = 56
const DEFAULT_IGNORE_DUPLICATE_MS = 300
const DEFAULT_DUPLICATE_DISTANCE = 4

const STATIC_ITEM_KEYS: readonly ToolbarItemKey[] = [
  'more'
]

export const hasSchemaField = (
  schema: NodeSchema | undefined,
  scope: 'data' | 'style',
  path: string
) => schema?.fields.some((field) => field.scope === scope && field.path === path) ?? false

export const readTextFieldKey = (
  node: Node,
  schema?: NodeSchema
): 'title' | 'text' => {
  const schemaField = schema?.fields.find((field) =>
    field.scope === 'data' && (field.path === 'text' || field.path === 'title')
  )

  if (schemaField?.path === 'text' || schemaField?.path === 'title') {
    return schemaField.path
  }

  if (typeof node.data?.text === 'string') return 'text'
  return 'title'
}

export const readTextValue = (
  node: Node,
  schema?: NodeSchema
) => {
  const key = readTextFieldKey(node, schema)
  const value = node.data?.[key]
  return typeof value === 'string' ? value : ''
}

export const resolveToolbarItemKeys = (
  can: Pick<NodeSelectionCan, 'align' | 'fill' | 'stroke' | 'text'>,
  count: number
): ToolbarItemKey[] => [
  ...(count > 1 && can.align ? ['layout'] as const : []),
  ...(can.fill ? ['fill'] as const : []),
  ...(can.stroke ? ['stroke'] as const : []),
  ...(can.text ? ['text'] as const : []),
  ...STATIC_ITEM_KEYS
]

export const buildToolbarItem = (
  key: ToolbarItemKey
): ToolbarItem => ({
  key,
  label:
    key === 'fill'
      ? 'Fill'
      : key === 'stroke'
        ? 'Stroke'
        : key === 'text'
          ? 'Text'
          : key === 'layout'
            ? 'Layout'
            : 'More',
  active: false
})

export const resolveToolbarPlacement = ({
  worldToScreen,
  rect
}: {
  worldToScreen: (point: Point) => Point
  rect: Rect
}) => {
  const topCenter = worldToScreen({
    x: rect.x + rect.width / 2,
    y: rect.y
  })
  const bottomCenter = worldToScreen({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height
  })
  const placement =
    topCenter.y - TOOLBAR_VERTICAL_GAP > TOOLBAR_MIN_TOP_SPACE
      ? 'top'
      : 'bottom'

  return {
    placement,
    anchor: placement === 'top' ? topCenter : bottomCenter
  } as {
    placement: ToolbarPlacement
    anchor: Point
  }
}

const resolveHorizontalPosition = (
  centerX: number,
  containerWidth: number,
  estimatedWidth: number
) => {
  if (centerX <= estimatedWidth / 2 + SAFE_MARGIN) {
    return {
      left: SAFE_MARGIN,
      transform: ''
    }
  }
  if (centerX >= containerWidth - estimatedWidth / 2 - SAFE_MARGIN) {
    return {
      left: containerWidth - SAFE_MARGIN,
      transform: 'translateX(-100%)'
    }
  }
  return {
    left: centerX,
    transform: 'translateX(-50%)'
  }
}

export const buildToolbarStyle = ({
  placement,
  x,
  y,
  containerWidth,
  itemCount
}: {
  placement: ToolbarPlacement
  x: number
  y: number
  containerWidth: number
  itemCount: number
}): CSSProperties => {
  const widthEstimate = Math.max(160, itemCount * 36 + 28)
  const horizontal = resolveHorizontalPosition(x, containerWidth, widthEstimate)
  return {
    left: horizontal.left,
    top: y,
    transform: [horizontal.transform, placement === 'top' ? 'translateY(-100%)' : 'translateY(0)']
      .filter(Boolean)
      .join(' ')
  }
}

export const buildToolbarMenuStyle = ({
  anchor,
  containerWidth,
  containerHeight
}: {
  anchor: ToolbarMenuAnchor
  containerWidth: number
  containerHeight: number
}): CSSProperties => {
  const horizontal = resolveHorizontalPosition(anchor.centerX, containerWidth, MENU_WIDTH)
  const placeBottom = containerHeight - anchor.bottom >= 240
  return {
    left: horizontal.left,
    top: placeBottom ? anchor.bottom + 8 : anchor.top - 8,
    transform: [horizontal.transform, placeBottom ? 'translateY(0)' : 'translateY(-100%)']
      .filter(Boolean)
      .join(' ')
  }
}

export const readMenuAnchor = ({
  container,
  button
}: {
  container: HTMLDivElement | null
  button: HTMLButtonElement | null | undefined
}) => {
  if (!container || !button) return undefined

  const rect = button.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return {
    top: rect.top - containerRect.top,
    bottom: rect.bottom - containerRect.top,
    centerX: rect.left - containerRect.left + rect.width / 2
  }
}

export const isDuplicateMenuOpen = (
  prev: MenuOpenSnapshot | null,
  next: MenuOpenSnapshot,
  options?: {
    maxDelayMs?: number
    maxDistance?: number
  }
) => {
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_IGNORE_DUPLICATE_MS
  const maxDistance = options?.maxDistance ?? DEFAULT_DUPLICATE_DISTANCE

  if (!prev) return false
  if (next.time - prev.time > maxDelayMs) return false
  return (
    Math.abs(prev.x - next.x) <= maxDistance
    && Math.abs(prev.y - next.y) <= maxDistance
  )
}

export const readContextMenuPlacement = ({
  screen,
  containerWidth,
  containerHeight
}: {
  screen: Point
  containerWidth: number
  containerHeight: number
}): ContextMenuPlacement => {
  const left = Math.min(
    Math.max(SAFE_MARGIN, screen.x),
    Math.max(SAFE_MARGIN, containerWidth - SAFE_MARGIN)
  )
  const top = Math.min(
    Math.max(SAFE_MARGIN, screen.y),
    Math.max(SAFE_MARGIN, containerHeight - SAFE_MARGIN)
  )

  const alignRight = left + MENU_WIDTH > containerWidth - SAFE_MARGIN
  const alignBottom = top + 280 > containerHeight - SAFE_MARGIN

  return {
    left,
    top,
    transform: `${alignRight ? 'translateX(-100%)' : ''} ${alignBottom ? 'translateY(-100%)' : ''}`.trim(),
    submenuSide: alignRight ? 'left' : 'right'
  }
}

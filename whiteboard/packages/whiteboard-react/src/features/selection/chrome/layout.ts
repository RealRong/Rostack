import type { Node, NodeSchema, Point, Rect } from '@whiteboard/core/types'
import type { CSSProperties } from 'react'
import type {
  ContextMenuPlacement,
  ToolbarPlacement
} from '../../../types/selection'

const SAFE_MARGIN = 12
const MENU_WIDTH = 220
const TOOLBAR_VERTICAL_GAP = 12
const TOOLBAR_MIN_TOP_SPACE = 56

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

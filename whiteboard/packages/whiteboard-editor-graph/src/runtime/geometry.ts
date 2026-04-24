import type {
  CanvasItemRef,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type {
  ChromeOverlay,
  EdgeLabelView,
  SceneItem,
  SelectionState
} from '../contracts/editor'

export const EMPTY_SIZE: Size = {
  width: 0,
  height: 0
}

export const EMPTY_RECT: Rect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0
}

export const isPointEqual = (
  left: Point | undefined,
  right: Point | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.x === right.x
  && left.y === right.y
)

export const isSizeEqual = (
  left: Size | undefined,
  right: Size | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.width === right.width
  && left.height === right.height
)

export const isRectEqual = (
  left: Rect | undefined,
  right: Rect | undefined
): boolean => left === right || (
  left !== undefined
  && right !== undefined
  && left.x === right.x
  && left.y === right.y
  && left.width === right.width
  && left.height === right.height
)

export const isCanvasItemRefEqual = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

export const isSceneItemEqual = (
  left: SceneItem,
  right: SceneItem
): boolean => left.kind === right.kind && left.id === right.id

export const isChromeOverlayEqual = (
  left: ChromeOverlay,
  right: ChromeOverlay
): boolean => left.kind === right.kind && left.id === right.id

export const isSelectionStateEqual = (
  left: SelectionState,
  right: SelectionState
): boolean => left.nodeIds.length === right.nodeIds.length
  && left.edgeIds.length === right.edgeIds.length
  && left.nodeIds.every((value, index) => value === right.nodeIds[index])
  && left.edgeIds.every((value, index) => value === right.edgeIds[index])

export const isEdgeLabelViewEqual = (
  left: EdgeLabelView,
  right: EdgeLabelView
): boolean => (
  left.labelId === right.labelId
  && left.text === right.text
  && left.displayText === right.displayText
  && left.style === right.style
  && isSizeEqual(left.size, right.size)
  && isPointEqual(left.point, right.point)
  && left.angle === right.angle
  && isRectEqual(left.rect, right.rect)
  && left.maskRect.x === right.maskRect.x
  && left.maskRect.y === right.maskRect.y
  && left.maskRect.width === right.maskRect.width
  && left.maskRect.height === right.maskRect.height
  && left.maskRect.radius === right.maskRect.radius
  && left.maskRect.angle === right.maskRect.angle
  && isPointEqual(left.maskRect.center, right.maskRect.center)
)

const collectBoundingRect = (
  rects: readonly Rect[]
): Rect | undefined => {
  if (rects.length === 0) {
    return undefined
  }

  let minX = rects[0]!.x
  let minY = rects[0]!.y
  let maxX = rects[0]!.x + rects[0]!.width
  let maxY = rects[0]!.y + rects[0]!.height

  for (let index = 1; index < rects.length; index += 1) {
    const rect = rects[index]!
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export const collectRects = (
  values: Iterable<Rect>
): Rect | undefined => collectBoundingRect([...values])

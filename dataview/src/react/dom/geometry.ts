export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type Box = Rect

export interface RectItem<TId = string> {
  id: TId
  rect: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>
}

export const normalizeRect = (
  rect: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>
): Rect => {
  const left = Math.min(rect.left, rect.right)
  const top = Math.min(rect.top, rect.bottom)
  const right = Math.max(rect.left, rect.right)
  const bottom = Math.max(rect.top, rect.bottom)

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  }
}

export const pointIn = (
  container: HTMLElement,
  point: Point
): Point => {
  const rect = container.getBoundingClientRect()
  return {
    x: point.x - rect.left + container.scrollLeft,
    y: point.y - rect.top + container.scrollTop
  }
}

export const rectIn = (
  container: HTMLElement,
  rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>
    & Partial<Pick<DOMRectReadOnly, 'width' | 'height'>>
): Rect => {
  const containerRect = container.getBoundingClientRect()
  return normalizeRect({
    left: rect.left - containerRect.left + container.scrollLeft,
    top: rect.top - containerRect.top + container.scrollTop,
    right: rect.right - containerRect.left + container.scrollLeft,
    bottom: rect.bottom - containerRect.top + container.scrollTop
  })
}

export const elementRectIn = (
  container: HTMLElement,
  element: Element
): Rect => rectIn(
  container,
  element.getBoundingClientRect()
)

export const rectFromPoints = (
  start: Point,
  current: Point
): Rect => normalizeRect({
  left: start.x,
  top: start.y,
  right: current.x,
  bottom: current.y
})

export const containsPoint = (
  rect: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>,
  point: Point
) => (
  point.x >= rect.left
  && point.x <= rect.right
  && point.y >= rect.top
  && point.y <= rect.bottom
)

export const intersects = (
  left: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>,
  right: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>
) => (
  left.left < right.right
  && left.right > right.left
  && left.top < right.bottom
  && left.bottom > right.top
)

export const idsInRect = <TId>(
  order: readonly TId[],
  items: readonly RectItem<TId>[],
  rect: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'> | null
): readonly TId[] => {
  if (!rect || !order.length || !items.length) {
    return []
  }

  const hitIds = new Set<TId>()
  items.forEach(item => {
    if (intersects(rect, item.rect)) {
      hitIds.add(item.id)
    }
  })

  return order.filter(id => hitIds.has(id))
}

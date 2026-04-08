import type { Rect } from './geometry.ts'

export type ScrollNode = HTMLElement | Window

export interface ScrollViewport {
  node: ScrollNode
  rect: Rect
}

export interface ScrollMetrics {
  left: number
  top: number
  maxLeft: number
  maxTop: number
}

const isWindow = (
  node: ScrollNode
): node is Window => (
  typeof Window !== 'undefined'
  && node instanceof Window
)

const ownerWindow = (
  node: Node | null | undefined
) => node?.ownerDocument?.defaultView ?? null

export const viewportRect = (
  node: ScrollNode
): Rect => {
  if (isWindow(node)) {
    return {
      left: 0,
      top: 0,
      right: node.innerWidth,
      bottom: node.innerHeight,
      width: node.innerWidth,
      height: node.innerHeight
    }
  }

  const rect = node.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  }
}

export const closestPageScrollContainer = (
  node: Element | null | undefined
) => node?.closest<HTMLElement>('[data-page-scroll]') ?? null

export const pageScrollNode = (
  node: Element | null | undefined
): ScrollNode | null => (
  closestPageScrollContainer(node)
  ?? ownerWindow(node)
)

export const scrollViewport = (
  node: HTMLElement
): ScrollViewport | null => {
  const scrollNode = pageScrollNode(node)
  if (!scrollNode) {
    return null
  }

  return {
    node: scrollNode,
    rect: viewportRect(scrollNode)
  }
}

export const scrollMetrics = (
  node: ScrollNode
): ScrollMetrics => {
  if (isWindow(node)) {
    const scrollingElement = node.document.scrollingElement
    return {
      left: node.scrollX,
      top: node.scrollY,
      maxLeft: Math.max(0, (scrollingElement?.scrollWidth ?? node.innerWidth) - node.innerWidth),
      maxTop: Math.max(0, (scrollingElement?.scrollHeight ?? node.innerHeight) - node.innerHeight)
    }
  }

  return {
    left: node.scrollLeft,
    top: node.scrollTop,
    maxLeft: Math.max(0, node.scrollWidth - node.clientWidth),
    maxTop: Math.max(0, node.scrollHeight - node.clientHeight)
  }
}

export const scrollByClamped = (input: {
  node: ScrollNode
  left?: number
  top?: number
}) => {
  const deltaLeft = input.left ?? 0
  const deltaTop = input.top ?? 0
  if (!deltaLeft && !deltaTop) {
    return {
      left: 0,
      top: 0
    }
  }

  const metrics = scrollMetrics(input.node)
  const nextLeft = Math.max(0, Math.min(metrics.maxLeft, metrics.left + deltaLeft))
  const nextTop = Math.max(0, Math.min(metrics.maxTop, metrics.top + deltaTop))
  const movedLeft = nextLeft - metrics.left
  const movedTop = nextTop - metrics.top

  if (!movedLeft && !movedTop) {
    return {
      left: 0,
      top: 0
    }
  }

  if (isWindow(input.node)) {
    input.node.scrollTo({
      left: nextLeft,
      top: nextTop
    })
  } else {
    input.node.scrollLeft = nextLeft
    input.node.scrollTop = nextTop
  }

  return {
    left: movedLeft,
    top: movedTop
  }
}

export interface RevealInsetValue {
  x?: number
  y?: number
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type RevealInset = number | RevealInsetValue

const insetValue = (
  inset: RevealInset | undefined,
  axis: 'top' | 'right' | 'bottom' | 'left'
) => {
  if (typeof inset === 'number') {
    return inset
  }

  switch (axis) {
    case 'top':
      return inset?.top ?? inset?.y ?? 0
    case 'bottom':
      return inset?.bottom ?? inset?.y ?? 0
    case 'left':
      return inset?.left ?? inset?.x ?? 0
    case 'right':
      return inset?.right ?? inset?.x ?? 0
  }
}

export const revealY = (input: {
  node: ScrollNode
  top: number
  bottom: number
  inset?: RevealInset
}) => {
  const viewport = viewportRect(input.node)
  const viewportTop = viewport.top + insetValue(input.inset, 'top')
  const viewportBottom = viewport.bottom - insetValue(input.inset, 'bottom')

  if (input.top < viewportTop) {
    scrollByClamped({
      node: input.node,
      top: input.top - viewportTop
    })
    return
  }

  if (input.bottom > viewportBottom) {
    scrollByClamped({
      node: input.node,
      top: input.bottom - viewportBottom
    })
  }
}

export const revealX = (input: {
  node: ScrollNode
  left: number
  right: number
  inset?: RevealInset
}) => {
  const viewport = viewportRect(input.node)
  const viewportLeft = viewport.left + insetValue(input.inset, 'left')
  const viewportRight = viewport.right - insetValue(input.inset, 'right')

  if (input.left < viewportLeft) {
    scrollByClamped({
      node: input.node,
      left: input.left - viewportLeft
    })
    return
  }

  if (input.right > viewportRight) {
    scrollByClamped({
      node: input.node,
      left: input.right - viewportRight
    })
  }
}

export const revealRect = (
  node: ScrollNode,
  rect: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>,
  inset?: RevealInset
) => {
  revealX({
    node,
    left: rect.left,
    right: rect.right,
    inset
  })
  revealY({
    node,
    top: rect.top,
    bottom: rect.bottom,
    inset
  })
}

export const revealElement = (
  node: ScrollNode,
  element: Element,
  inset?: RevealInset
) => {
  revealRect(node, element.getBoundingClientRect(), inset)
}

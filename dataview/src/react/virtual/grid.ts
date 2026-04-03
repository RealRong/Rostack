export interface InlineInsets {
  left: number
  right: number
}

export interface AutoFillGridMetrics {
  contentWidth: number
  columnCount: number
  itemWidth: number
}

export const readInlineInsets = (node: HTMLElement | null): InlineInsets => {
  if (!node) {
    return {
      left: 0,
      right: 0
    }
  }

  const ownerWindow = node.ownerDocument.defaultView
  const style = ownerWindow?.getComputedStyle(node)
  return {
    left: Number.parseFloat(style?.paddingLeft ?? '0') || 0,
    right: Number.parseFloat(style?.paddingRight ?? '0') || 0
  }
}

export const resolveAutoFillGridMetrics = (input: {
  containerWidth: number
  minItemWidth: number
  gap: number
  insetLeft?: number
  insetRight?: number
}): AutoFillGridMetrics => {
  const insetLeft = input.insetLeft ?? 0
  const insetRight = input.insetRight ?? 0
  const contentWidth = Math.max(
    input.minItemWidth,
    input.containerWidth - insetLeft - insetRight
  )
  const columnCount = Math.max(
    1,
    Math.floor((contentWidth + input.gap) / (input.minItemWidth + input.gap))
  )
  const itemWidth = (
    contentWidth - input.gap * Math.max(0, columnCount - 1)
  ) / columnCount

  return {
    contentWidth,
    columnCount,
    itemWidth
  }
}

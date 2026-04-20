import { geometry as geometryApi } from '@whiteboard/core/geometry'
import type { NodeId, Point, Rect } from '@whiteboard/core/types'

export type NodeAlignMode =
  | 'top'
  | 'left'
  | 'right'
  | 'bottom'
  | 'horizontal'
  | 'vertical'

export type NodeDistributeMode =
  | 'horizontal'
  | 'vertical'

export type NodeLayoutEntry = {
  id: NodeId
  position: Point
  bounds: Rect
}

export type NodeLayoutUpdate = {
  id: NodeId
  position: Point
}

const getRectEdges = (rect: Rect) => ({
  left: rect.x,
  right: rect.x + rect.width,
  top: rect.y,
  bottom: rect.y + rect.height,
  centerX: rect.x + rect.width / 2,
  centerY: rect.y + rect.height / 2
})

const getUnionBounds = (entries: readonly NodeLayoutEntry[]): Rect | undefined => {
  if (!entries.length) {
    return undefined
  }

  const [first, ...rest] = entries
  let left = first.bounds.x
  let top = first.bounds.y
  let right = first.bounds.x + first.bounds.width
  let bottom = first.bounds.y + first.bounds.height

  rest.forEach((entry) => {
    left = Math.min(left, entry.bounds.x)
    top = Math.min(top, entry.bounds.y)
    right = Math.max(right, entry.bounds.x + entry.bounds.width)
    bottom = Math.max(bottom, entry.bounds.y + entry.bounds.height)
  })

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  }
}

const toUpdate = (
  entry: NodeLayoutEntry,
  delta: Point
): NodeLayoutUpdate | undefined => {
  if (delta.x === 0 && delta.y === 0) {
    return undefined
  }

  const nextPosition = {
    x: entry.position.x + delta.x,
    y: entry.position.y + delta.y
  }

  if (geometryApi.equal.point(entry.position, nextPosition)) {
    return undefined
  }

  return {
    id: entry.id,
    position: nextPosition
  }
}

export const alignNodes = (
  entries: readonly NodeLayoutEntry[],
  mode: NodeAlignMode
): NodeLayoutUpdate[] => {
  if (entries.length < 2) {
    return []
  }

  const selectionBounds = getUnionBounds(entries)
  if (!selectionBounds) {
    return []
  }

  const selectionEdges = getRectEdges(selectionBounds)
  const updates: NodeLayoutUpdate[] = []

  entries.forEach((entry) => {
    const edges = getRectEdges(entry.bounds)
    const update =
      mode === 'top'
        ? toUpdate(entry, { x: 0, y: selectionEdges.top - edges.top })
        : mode === 'left'
          ? toUpdate(entry, { x: selectionEdges.left - edges.left, y: 0 })
          : mode === 'right'
            ? toUpdate(entry, { x: selectionEdges.right - edges.right, y: 0 })
            : mode === 'bottom'
              ? toUpdate(entry, { x: 0, y: selectionEdges.bottom - edges.bottom })
              : mode === 'horizontal'
                ? toUpdate(entry, { x: 0, y: selectionEdges.centerY - edges.centerY })
                : toUpdate(entry, { x: selectionEdges.centerX - edges.centerX, y: 0 })

    if (update) {
      updates.push(update)
    }
  })

  return updates
}

const sortEntriesByAxis = (
  entries: readonly NodeLayoutEntry[],
  mode: NodeDistributeMode
) => entries
  .map((entry, index) => ({ entry, index }))
  .sort((left, right) => {
    const leftEdges = getRectEdges(left.entry.bounds)
    const rightEdges = getRectEdges(right.entry.bounds)
    const comparisons = mode === 'horizontal'
      ? [
          leftEdges.left - rightEdges.left,
          leftEdges.centerX - rightEdges.centerX,
          leftEdges.top - rightEdges.top,
          leftEdges.centerY - rightEdges.centerY
        ]
      : [
          leftEdges.top - rightEdges.top,
          leftEdges.centerY - rightEdges.centerY,
          leftEdges.left - rightEdges.left,
          leftEdges.centerX - rightEdges.centerX
        ]

    for (const value of comparisons) {
      if (value !== 0) {
        return value
      }
    }

    return left.index - right.index
  })
  .map(({ entry }) => entry)

export const distributeNodes = (
  entries: readonly NodeLayoutEntry[],
  mode: NodeDistributeMode
): NodeLayoutUpdate[] => {
  if (entries.length < 3) {
    return []
  }

  const ordered = sortEntriesByAxis(entries, mode)
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  if (!first || !last) {
    return []
  }

  const span =
    mode === 'horizontal'
      ? (last.bounds.x + last.bounds.width) - first.bounds.x
      : (last.bounds.y + last.bounds.height) - first.bounds.y
  const totalSize = ordered.reduce(
    (sum, entry) => sum + (mode === 'horizontal' ? entry.bounds.width : entry.bounds.height),
    0
  )
  const gap = (span - totalSize) / (ordered.length - 1)
  const updates: NodeLayoutUpdate[] = []

  let cursor =
    mode === 'horizontal'
      ? first.bounds.x + first.bounds.width + gap
      : first.bounds.y + first.bounds.height + gap

  ordered.slice(1, -1).forEach((entry) => {
    const update =
      mode === 'horizontal'
        ? toUpdate(entry, { x: cursor - entry.bounds.x, y: 0 })
        : toUpdate(entry, { x: 0, y: cursor - entry.bounds.y })

    if (update) {
      updates.push(update)
    }

    cursor += mode === 'horizontal'
      ? entry.bounds.width + gap
      : entry.bounds.height + gap
  })

  return updates
}

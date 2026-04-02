import type { Rect, Size } from '../types'

type HorizontalResizeEdge = 'left' | 'right'
type VerticalResizeEdge = 'top' | 'bottom'
type HorizontalSnapEdge = 'left' | 'right' | 'centerX'
type VerticalSnapEdge = 'top' | 'bottom' | 'centerY'

export type SnapAxis = 'x' | 'y'
export type SnapEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY'

export type Guide = {
  axis: SnapAxis
  value: number
  from: number
  to: number
  targetEdge: SnapEdge
  sourceEdge: SnapEdge
}

export type SnapResult = {
  dx?: number
  dy?: number
  guides: Guide[]
  snappedEdges?: {
    x?: { targetEdge: SnapEdge; sourceEdge: SnapEdge }
    y?: { targetEdge: SnapEdge; sourceEdge: SnapEdge }
  }
}

export type SnapCandidate = {
  id: string
  rect: Rect
  lines: {
    left: number
    right: number
    centerX: number
    top: number
    bottom: number
    centerY: number
  }
}

export type GridIndex = {
  cellSize: number
  buckets: Map<string, Set<string>>
  items: Map<string, SnapCandidate>
}

const keyForCell = (cx: number, cy: number) => `${cx},${cy}`

const getCellRange = (rect: Rect, cellSize: number) => {
  const minX = Math.floor(rect.x / cellSize)
  const maxX = Math.floor((rect.x + rect.width) / cellSize)
  const minY = Math.floor(rect.y / cellSize)
  const maxY = Math.floor((rect.y + rect.height) / cellSize)
  return { minX, maxX, minY, maxY }
}

export const buildSnapCandidates = (
  items: Array<{ id: string; rect: Rect }>
): SnapCandidate[] =>
  items.map((item) => {
    const { rect } = item
    return {
      id: item.id,
      rect,
      lines: {
        left: rect.x,
        right: rect.x + rect.width,
        centerX: rect.x + rect.width / 2,
        top: rect.y,
        bottom: rect.y + rect.height,
        centerY: rect.y + rect.height / 2
      }
    }
  })

export const createGridIndex = (
  candidates: SnapCandidate[],
  cellSize: number
): GridIndex => {
  const buckets = new Map<string, Set<string>>()
  const items = new Map<string, SnapCandidate>()
  candidates.forEach((candidate) => {
    items.set(candidate.id, candidate)
    const { minX, maxX, minY, maxY } = getCellRange(candidate.rect, cellSize)
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const key = keyForCell(cx, cy)
        const bucket = buckets.get(key) ?? new Set<string>()
        bucket.add(candidate.id)
        buckets.set(key, bucket)
      }
    }
  })
  return { cellSize, buckets, items }
}

export const queryGridIndex = (index: GridIndex, rect: Rect): SnapCandidate[] => {
  const { minX, maxX, minY, maxY } = getCellRange(rect, index.cellSize)
  const ids = new Set<string>()
  for (let cx = minX; cx <= maxX; cx += 1) {
    for (let cy = minY; cy <= maxY; cy += 1) {
      const bucket = index.buckets.get(keyForCell(cx, cy))
      if (!bucket) continue
      bucket.forEach((id) => ids.add(id))
    }
  }
  return Array.from(ids)
    .map((id) => index.items.get(id))
    .filter((item): item is SnapCandidate => Boolean(item))
}

const edgePriority = (edge: SnapEdge) => {
  if (edge === 'centerX' || edge === 'centerY') return 0
  return 1
}

export const computeSnap = (
  movingRect: Rect,
  candidates: SnapCandidate[],
  threshold: number,
  excludeId?: string,
  options?: { allowCross?: boolean; crossThreshold?: number; crossThresholdRatio?: number }
): SnapResult => {
  const allowCross = options?.allowCross ?? false
  const crossThreshold =
    options?.crossThreshold ?? threshold * (options?.crossThresholdRatio ?? 0.6)
  const movingLines = {
    left: movingRect.x,
    right: movingRect.x + movingRect.width,
    centerX: movingRect.x + movingRect.width / 2,
    top: movingRect.y,
    bottom: movingRect.y + movingRect.height,
    centerY: movingRect.y + movingRect.height / 2
  }

  let bestX:
    | {
        delta: number
        distance: number
        target: SnapCandidate
        targetEdge: SnapEdge
        sourceEdge: SnapEdge
      }
    | undefined
  let bestY:
    | {
        delta: number
        distance: number
        target: SnapCandidate
        targetEdge: SnapEdge
        sourceEdge: SnapEdge
      }
    | undefined

  for (const candidate of candidates) {
    if (candidate.id === excludeId) continue
    const targetLines = candidate.lines

    const xPairs: Array<[SnapEdge, SnapEdge]> = [
      ['centerX', 'centerX'],
      ['left', 'left'],
      ['right', 'right']
    ]
    if (allowCross) {
      xPairs.push(
        ['left', 'centerX'],
        ['left', 'right'],
        ['centerX', 'left'],
        ['centerX', 'right'],
        ['right', 'left'],
        ['right', 'centerX']
      )
    }
    xPairs.forEach(([sourceEdge, targetEdge]) => {
      const delta =
        targetLines[targetEdge as keyof typeof targetLines] -
        movingLines[sourceEdge as keyof typeof movingLines]
      const dist = Math.abs(delta)
      const limit = sourceEdge === targetEdge ? threshold : crossThreshold
      if (dist > limit) return
      if (
        !bestX ||
        dist < bestX.distance ||
        (dist === bestX.distance &&
          edgePriority(sourceEdge) < edgePriority(bestX.sourceEdge))
      ) {
        bestX = {
          delta,
          distance: dist,
          target: candidate,
          targetEdge,
          sourceEdge
        }
      }
    })

    const yPairs: Array<[SnapEdge, SnapEdge]> = [
      ['centerY', 'centerY'],
      ['top', 'top'],
      ['bottom', 'bottom']
    ]
    if (allowCross) {
      yPairs.push(
        ['top', 'centerY'],
        ['top', 'bottom'],
        ['centerY', 'top'],
        ['centerY', 'bottom'],
        ['bottom', 'top'],
        ['bottom', 'centerY']
      )
    }
    yPairs.forEach(([sourceEdge, targetEdge]) => {
      const delta =
        targetLines[targetEdge as keyof typeof targetLines] -
        movingLines[sourceEdge as keyof typeof movingLines]
      const dist = Math.abs(delta)
      const limit = sourceEdge === targetEdge ? threshold : crossThreshold
      if (dist > limit) return
      if (
        !bestY ||
        dist < bestY.distance ||
        (dist === bestY.distance &&
          edgePriority(sourceEdge) < edgePriority(bestY.sourceEdge))
      ) {
        bestY = {
          delta,
          distance: dist,
          target: candidate,
          targetEdge,
          sourceEdge
        }
      }
    })
  }

  const guides: Guide[] = []
  if (bestX) {
    const targetRect = bestX.target.rect
    const from = Math.min(movingRect.y, targetRect.y)
    const to = Math.max(movingRect.y + movingRect.height, targetRect.y + targetRect.height)
    guides.push({
      axis: 'x',
      value: movingLines[bestX.sourceEdge as keyof typeof movingLines] + bestX.delta,
      from,
      to,
      targetEdge: bestX.targetEdge,
      sourceEdge: bestX.sourceEdge
    })
  }
  if (bestY) {
    const targetRect = bestY.target.rect
    const from = Math.min(movingRect.x, targetRect.x)
    const to = Math.max(movingRect.x + movingRect.width, targetRect.x + targetRect.width)
    guides.push({
      axis: 'y',
      value: movingLines[bestY.sourceEdge as keyof typeof movingLines] + bestY.delta,
      from,
      to,
      targetEdge: bestY.targetEdge,
      sourceEdge: bestY.sourceEdge
    })
  }

  return {
    dx: bestX ? bestX.delta : undefined,
    dy: bestY ? bestY.delta : undefined,
    guides,
    snappedEdges: {
      x: bestX
        ? { targetEdge: bestX.targetEdge, sourceEdge: bestX.sourceEdge }
        : undefined,
      y: bestY
        ? { targetEdge: bestY.targetEdge, sourceEdge: bestY.sourceEdge }
        : undefined
    }
  }
}

const buildResizeGuideX = (
  movingRect: Rect,
  target: SnapCandidate,
  sourceEdge: HorizontalResizeEdge,
  targetEdge: HorizontalSnapEdge
): Guide => {
  const from = Math.min(movingRect.y, target.rect.y)
  const to = Math.max(movingRect.y + movingRect.height, target.rect.y + target.rect.height)
  return {
    axis: 'x',
    value: target.lines[targetEdge],
    from,
    to,
    targetEdge,
    sourceEdge
  }
}

const buildResizeGuideY = (
  movingRect: Rect,
  target: SnapCandidate,
  sourceEdge: VerticalResizeEdge,
  targetEdge: VerticalSnapEdge
): Guide => {
  const from = Math.min(movingRect.x, target.rect.x)
  const to = Math.max(movingRect.x + movingRect.width, target.rect.x + target.rect.width)
  return {
    axis: 'y',
    value: target.lines[targetEdge],
    from,
    to,
    targetEdge,
    sourceEdge
  }
}

export const computeResizeSnap = (options: {
  movingRect: Rect
  candidates: SnapCandidate[]
  threshold: number
  minSize: Size
  excludeId?: string
  sourceEdges: {
    sourceX?: HorizontalResizeEdge
    sourceY?: VerticalResizeEdge
  }
}): {
  rect: Rect
  width: number
  height: number
  guides: Guide[]
} => {
  const { movingRect, candidates, threshold, minSize, excludeId, sourceEdges } = options
  const movingLines = {
    left: movingRect.x,
    right: movingRect.x + movingRect.width,
    centerX: movingRect.x + movingRect.width / 2,
    top: movingRect.y,
    bottom: movingRect.y + movingRect.height,
    centerY: movingRect.y + movingRect.height / 2
  }

  const xTargets: HorizontalSnapEdge[] = ['left', 'right', 'centerX']
  const yTargets: VerticalSnapEdge[] = ['top', 'bottom', 'centerY']

  let bestX:
    | {
        delta: number
        target: SnapCandidate
        targetEdge: HorizontalSnapEdge
        sourceEdge: HorizontalResizeEdge
        distance: number
      }
    | undefined
  let bestY:
    | {
        delta: number
        target: SnapCandidate
        targetEdge: VerticalSnapEdge
        sourceEdge: VerticalResizeEdge
        distance: number
      }
    | undefined

  candidates.forEach((candidate) => {
    if (candidate.id === excludeId) return
    if (sourceEdges.sourceX) {
      xTargets.forEach((targetEdge) => {
        const delta =
          candidate.lines[targetEdge] -
          movingLines[sourceEdges.sourceX as keyof typeof movingLines]
        const dist = Math.abs(delta)
        if (dist > threshold) return
        if (!bestX || dist < bestX.distance) {
          bestX = {
            delta,
            target: candidate,
            targetEdge,
            sourceEdge: sourceEdges.sourceX as HorizontalResizeEdge,
            distance: dist
          }
        }
      })
    }
    if (sourceEdges.sourceY) {
      yTargets.forEach((targetEdge) => {
        const delta =
          candidate.lines[targetEdge] -
          movingLines[sourceEdges.sourceY as keyof typeof movingLines]
        const dist = Math.abs(delta)
        if (dist > threshold) return
        if (!bestY || dist < bestY.distance) {
          bestY = {
            delta,
            target: candidate,
            targetEdge,
            sourceEdge: sourceEdges.sourceY as VerticalResizeEdge,
            distance: dist
          }
        }
      })
    }
  })

  let nextLeft = movingRect.x
  let nextTop = movingRect.y
  let nextRight = movingRect.x + movingRect.width
  let nextBottom = movingRect.y + movingRect.height
  const guides: Guide[] = []

  if (bestX) {
    if (bestX.sourceEdge === 'left') {
      nextLeft += bestX.delta
    } else {
      nextRight += bestX.delta
    }
    if (nextRight - nextLeft < minSize.width) {
      nextLeft = movingRect.x
      nextRight = movingRect.x + movingRect.width
    }
    guides.push(
      buildResizeGuideX(movingRect, bestX.target, bestX.sourceEdge, bestX.targetEdge)
    )
  }

  if (bestY) {
    if (bestY.sourceEdge === 'top') {
      nextTop += bestY.delta
    } else {
      nextBottom += bestY.delta
    }
    if (nextBottom - nextTop < minSize.height) {
      nextTop = movingRect.y
      nextBottom = movingRect.y + movingRect.height
    }
    guides.push(
      buildResizeGuideY(movingRect, bestY.target, bestY.sourceEdge, bestY.targetEdge)
    )
  }

  return {
    rect: {
      x: nextLeft,
      y: nextTop,
      width: nextRight - nextLeft,
      height: nextBottom - nextTop
    },
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
    guides
  }
}

import type { EdgeId, Rect } from '@whiteboard/core/types'
import {
  sameRect as isSameRectTuple,
  toFiniteOrUndefined
} from '@shared/core'

type RectTuple = {
  x?: number
  y?: number
  width?: number
  height?: number
}

type EdgeRectEntry = {
  rect: RectTuple
  bounds: Rect
  cellKeys: string[]
}

const keyForCell = (
  cx: number,
  cy: number
) => `${cx},${cy}`

const getCellRange = (
  rect: Rect,
  cellSize: number
) => {
  const minX = Math.floor(rect.x / cellSize)
  const maxX = Math.floor((rect.x + rect.width) / cellSize)
  const minY = Math.floor(rect.y / cellSize)
  const maxY = Math.floor((rect.y + rect.height) / cellSize)
  return {
    minX,
    maxX,
    minY,
    maxY
  }
}

const toCellKeys = (
  rect: Rect,
  cellSize: number
) => {
  const { minX, maxX, minY, maxY } = getCellRange(rect, cellSize)
  const keys: string[] = []

  for (let cx = minX; cx <= maxX; cx += 1) {
    for (let cy = minY; cy <= maxY; cy += 1) {
      keys.push(keyForCell(cx, cy))
    }
  }

  return keys
}

const toRectTuple = (
  rect: Rect
): RectTuple => ({
  x: toFiniteOrUndefined(rect.x),
  y: toFiniteOrUndefined(rect.y),
  width: toFiniteOrUndefined(rect.width),
  height: toFiniteOrUndefined(rect.height)
})

const isRectOverlap = (
  left: Rect,
  right: Rect
) => (
  left.x <= right.x + right.width
  && left.x + left.width >= right.x
  && left.y <= right.y + right.height
  && left.y + left.height >= right.y
)

export class EdgeRectIndex {
  private byId = new Map<EdgeId, EdgeRectEntry>()
  private buckets = new Map<string, Set<EdgeId>>()
  private readonly cellSize: number

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private removeFromBuckets = (
    edgeId: EdgeId,
    cellKeys: readonly string[]
  ) => {
    cellKeys.forEach((cellKey) => {
      const bucket = this.buckets.get(cellKey)
      if (!bucket) {
        return
      }

      bucket.delete(edgeId)
      if (!bucket.size) {
        this.buckets.delete(cellKey)
      }
    })
  }

  private addToBuckets = (
    edgeId: EdgeId,
    cellKeys: readonly string[]
  ) => {
    cellKeys.forEach((cellKey) => {
      const bucket = this.buckets.get(cellKey) ?? new Set<EdgeId>()
      bucket.add(edgeId)
      this.buckets.set(cellKey, bucket)
    })
  }

  private writeEntry = (
    edgeId: EdgeId,
    bounds: Rect,
    current: EdgeRectEntry | undefined
  ) => {
    const cellKeys = toCellKeys(bounds, this.cellSize)
    if (current) {
      this.removeFromBuckets(edgeId, current.cellKeys)
    }

    this.addToBuckets(edgeId, cellKeys)
    this.byId.set(edgeId, {
      rect: toRectTuple(bounds),
      bounds,
      cellKeys
    })
  }

  private deleteEntry = (
    edgeId: EdgeId,
    current: EdgeRectEntry | undefined
  ) => {
    if (!current) {
      return false
    }

    this.removeFromBuckets(edgeId, current.cellKeys)
    this.byId.delete(edgeId)
    return true
  }

  reset = (
    edgeIds: readonly EdgeId[],
    readBounds: (edgeId: EdgeId) => Rect | undefined
  ) => {
    this.byId.forEach((entry, edgeId) => {
      this.removeFromBuckets(edgeId, entry.cellKeys)
    })
    this.byId.clear()
    this.buckets.clear()

    let changed = false
    edgeIds.forEach((edgeId) => {
      const bounds = readBounds(edgeId)
      if (!bounds) {
        return
      }

      this.writeEntry(edgeId, bounds, undefined)
      changed = true
    })

    return changed
  }

  applyChange = (
    edgeIds: readonly EdgeId[],
    readBounds: (edgeId: EdgeId) => Rect | undefined
  ) => {
    let changed = false

    edgeIds.forEach((edgeId) => {
      const bounds = readBounds(edgeId)
      const current = this.byId.get(edgeId)

      if (!bounds) {
        changed = this.deleteEntry(edgeId, current) || changed
        return
      }

      const nextRect = toRectTuple(bounds)
      if (current && isSameRectTuple(current.rect, nextRect)) {
        return
      }

      this.writeEntry(edgeId, bounds, current)
      changed = true
    })

    return changed
  }

  idsInRect = (
    rect: Rect
  ): EdgeId[] => {
    const candidateIds = new Set<EdgeId>()
    const cellKeys = toCellKeys(rect, this.cellSize)

    cellKeys.forEach((cellKey) => {
      const bucket = this.buckets.get(cellKey)
      if (!bucket) {
        return
      }

      bucket.forEach((edgeId) => {
        candidateIds.add(edgeId)
      })
    })

    return [...candidateIds].filter((edgeId) => {
      const entry = this.byId.get(edgeId)
      return entry
        ? isRectOverlap(entry.bounds, rect)
        : false
    })
  }
}

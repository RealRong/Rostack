import type { CanvasNode } from '@whiteboard/engine/types/projection'
import type { NodeId, Rect } from '@whiteboard/core/types'
import type { SnapCandidate } from '@whiteboard/core/node'
import type { EngineReadIndex } from '@whiteboard/engine/types/instance'
import type { Invalidation } from '@whiteboard/core/types'
import {
  sameOrder as isSameRefOrder,
  sameRect as isSameRectTuple,
  toFiniteOrUndefined
} from '@shared/core'

type Rebuild = 'none' | 'dirty' | 'full'

const resolveRebuild = (invalidation: Invalidation): Rebuild => {
  if (invalidation.document || invalidation.canvasOrder) {
    return 'full'
  }
  if (invalidation.nodes.size > 0) {
    return 'dirty'
  }
  return 'none'
}

type RectTuple = {
  x?: number
  y?: number
  width?: number
  height?: number
}

const toRectTuple = (rect: Rect): RectTuple => ({
  x: toFiniteOrUndefined(rect.x),
  y: toFiniteOrUndefined(rect.y),
  width: toFiniteOrUndefined(rect.width),
  height: toFiniteOrUndefined(rect.height)
})

const canIndexSnapCandidate = (
  _entry: CanvasNode
) => true

const resolveSnapRect = (
  entry: CanvasNode
): Rect => entry.geometry.rect

type SnapCacheEntry = {
  rect: RectTuple
  candidate: SnapCandidate
  cellKeys: string[]
}

const keyForCell = (cx: number, cy: number) => `${cx},${cy}`

const getCellRange = (rect: Rect, cellSize: number) => {
  const minX = Math.floor(rect.x / cellSize)
  const maxX = Math.floor((rect.x + rect.width) / cellSize)
  const minY = Math.floor(rect.y / cellSize)
  const maxY = Math.floor((rect.y + rect.height) / cellSize)
  return { minX, maxX, minY, maxY }
}

const toCellKeys = (rect: Rect, cellSize: number) => {
  const { minX, maxX, minY, maxY } = getCellRange(rect, cellSize)
  const keys: string[] = []
  for (let cx = minX; cx <= maxX; cx += 1) {
    for (let cy = minY; cy <= maxY; cy += 1) {
      keys.push(keyForCell(cx, cy))
    }
  }
  return keys
}

export class SnapIndex {
  private byId = new Map<NodeId, SnapCacheEntry>()
  private buckets = new Map<string, Set<NodeId>>()
  private orderedIds: NodeId[] = []
  private orderedIdSet = new Set<NodeId>()
  private orderedCandidates: SnapCandidate[] = []
  private orderDirty = true
  private readonly cellSize: number

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private toCandidate = (nodeId: NodeId, rect: Rect): SnapCandidate => ({
    id: nodeId,
    rect,
    lines: {
      left: rect.x,
      right: rect.x + rect.width,
      centerX: rect.x + rect.width / 2,
      top: rect.y,
      bottom: rect.y + rect.height,
      centerY: rect.y + rect.height / 2
    }
  })

  private removeFromBuckets = (nodeId: NodeId, cellKeys: string[]) => {
    cellKeys.forEach((cellKey) => {
      const bucket = this.buckets.get(cellKey)
      if (!bucket) return
      bucket.delete(nodeId)
      if (!bucket.size) {
        this.buckets.delete(cellKey)
      }
    })
  }

  private addToBuckets = (nodeId: NodeId, cellKeys: string[]) => {
    cellKeys.forEach((cellKey) => {
      const bucket = this.buckets.get(cellKey) ?? new Set<NodeId>()
      bucket.add(nodeId)
      this.buckets.set(cellKey, bucket)
    })
  }

  private writeEntry = (
    nodeId: NodeId,
    rect: Rect,
    current: SnapCacheEntry | undefined,
    appendIfMissing: boolean
  ) => {
    const candidate = this.toCandidate(nodeId, rect)
    const cellKeys = toCellKeys(candidate.rect, this.cellSize)
    if (current) {
      this.removeFromBuckets(nodeId, current.cellKeys)
    } else if (appendIfMissing && !this.orderedIdSet.has(nodeId)) {
      this.orderedIds.push(nodeId)
      this.orderedIdSet.add(nodeId)
    }
    this.addToBuckets(nodeId, cellKeys)
    this.byId.set(nodeId, {
      rect: toRectTuple(rect),
      candidate,
      cellKeys
    })
    this.orderDirty = true
  }

  private deleteEntry = (
    nodeId: NodeId,
    current: SnapCacheEntry | undefined
  ) => {
    if (!current) {
      return false
    }

    this.removeFromBuckets(nodeId, current.cellKeys)
    this.byId.delete(nodeId)
    this.orderDirty = true
    return true
  }

  applyChange = (
    invalidation: Invalidation,
    node: Pick<EngineReadIndex['node'], 'all' | 'get'>,
    extraNodeIds: readonly NodeId[] = []
  ): boolean => {
    const rebuild = resolveRebuild(invalidation)
    switch (rebuild) {
      case 'none':
        return false
      case 'full':
        return this.syncFull(node.all())
      case 'dirty':
        return this.syncByNodeIds(
          new Set([
            ...invalidation.nodes,
            ...extraNodeIds
          ]),
          node.get
        )
      default:
        return false
    }
  }

  private syncFull = (entries: CanvasNode[]): boolean => {
    const seen = new Set<NodeId>()
    const nextOrderedIds: NodeId[] = []
    let changed = false

    entries.forEach((entry) => {
      const nodeId = entry.node.id
      seen.add(nodeId)
      nextOrderedIds.push(nodeId)

      if (!canIndexSnapCandidate(entry)) {
        const current = this.byId.get(nodeId)
        if (this.deleteEntry(nodeId, current)) {
          changed = true
        }
        return
      }

      const rect = toRectTuple(resolveSnapRect(entry))
      const current = this.byId.get(nodeId)
      if (current && isSameRectTuple(current.rect, rect)) {
        return
      }

      this.writeEntry(nodeId, resolveSnapRect(entry), current, false)
      changed = true
    })

    this.byId.forEach((entry, nodeId) => {
      if (seen.has(nodeId)) return
      this.removeFromBuckets(nodeId, entry.cellKeys)
      this.byId.delete(nodeId)
      this.orderDirty = true
      changed = true
    })

    if (!isSameRefOrder(this.orderedIds, nextOrderedIds)) {
      this.orderedIds = nextOrderedIds
      this.orderedIdSet = new Set(nextOrderedIds)
      this.orderDirty = true
      changed = true
    }

    return changed
  }

  private syncByNodeIds = (
    nodeIds: Iterable<NodeId>,
    getEntry: (nodeId: NodeId) => CanvasNode | undefined
  ): boolean => {
    const removed = new Set<NodeId>()
    let changed = false

    for (const nodeId of nodeIds) {
      const entry = getEntry(nodeId)
      const current = this.byId.get(nodeId)

      if (!entry) {
        if (this.deleteEntry(nodeId, current)) {
          removed.add(nodeId)
          changed = true
        }
        continue
      }

      if (!canIndexSnapCandidate(entry)) {
        if (this.deleteEntry(nodeId, current)) {
          changed = true
        }
        continue
      }

      const rect = toRectTuple(resolveSnapRect(entry))
      if (current && isSameRectTuple(current.rect, rect)) continue

      this.writeEntry(nodeId, resolveSnapRect(entry), current, true)
      changed = true
    }

    if (!changed) return false

    if (removed.size) {
      this.orderedIds = this.orderedIds.filter((nodeId) => !removed.has(nodeId))
      removed.forEach((nodeId) => {
        this.orderedIdSet.delete(nodeId)
      })
    }
    return true
  }

  all = (): SnapCandidate[] => {
    if (!this.orderDirty) return this.orderedCandidates
    this.orderedCandidates = this.orderedIds
      .map((id) => this.byId.get(id)?.candidate)
      .filter((candidate): candidate is SnapCandidate => Boolean(candidate))
    this.orderDirty = false
    return this.orderedCandidates
  }

  queryInRect = (rect: Rect): SnapCandidate[] => {
    const { minX, maxX, minY, maxY } = getCellRange(rect, this.cellSize)
    const ids = new Set<NodeId>()
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        const bucket = this.buckets.get(keyForCell(cx, cy))
        if (!bucket) continue
        bucket.forEach((id) => ids.add(id))
      }
    }

    return Array.from(ids)
      .map((id) => this.byId.get(id)?.candidate)
      .filter((candidate): candidate is SnapCandidate => Boolean(candidate))
  }
}

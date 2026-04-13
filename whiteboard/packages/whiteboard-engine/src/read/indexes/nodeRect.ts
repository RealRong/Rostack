import type { CanvasNode } from '#whiteboard-engine/projection'
import type { Node, NodeId, Rect } from '@whiteboard/core/types'
import {
  getNodeIdsInRect as getNodeIdsInRectRaw,
  readNodeRotation,
  type NodeRectHitOptions
} from '@whiteboard/core/node'
import type { BoardConfig } from '#whiteboard-engine/instance'
import type { ReadModel } from '#whiteboard-engine/read'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import { sameOrder as isSameRefOrder } from '@shared/core'
import { NodeGeometryCache } from '#whiteboard-engine/geometry/nodeGeometry'

type Rebuild = 'none' | 'dirty' | 'full'

const resolveRebuild = (impact: KernelReadImpact): Rebuild => {
  if (impact.reset || impact.node.list) {
    return 'full'
  }
  if (impact.node.geometry || impact.node.value) {
    return impact.node.ids.length === 0 ? 'full' : 'dirty'
  }
  return 'none'
}

export class NodeRectIndex {
  private geometry: NodeGeometryCache
  private entriesById = new Map<NodeId, CanvasNode>()
  private orderedIds: NodeId[] = []
  private orderedIdSet = new Set<NodeId>()
  private orderedEntries: CanvasNode[] = []
  private orderDirty = true
  private dirtyIds: readonly NodeId[] = []

  constructor(config: BoardConfig) {
    this.geometry = new NodeGeometryCache(config.nodeSize)
  }

  applyChange = (
    impact: KernelReadImpact,
    model: ReadModel
  ): boolean => {
    this.dirtyIds = []
    const rebuild = resolveRebuild(impact)
    switch (rebuild) {
      case 'none':
        return false
      case 'full':
        return this.syncFull(model.nodes.canvas)
      case 'dirty':
        return this.syncByNodeIds(
          impact.node.ids,
          model.canvas.nodeById
        )
      default:
        return false
    }
  }

  private syncFull = (
    nodes: Node[]
  ): boolean => {
    const nextOrderedIds: NodeId[] = []
    let changed = this.geometry.syncFull(nodes)

    nodes.forEach((node) => {
      nextOrderedIds.push(node.id)
    })

    if (!isSameRefOrder(this.orderedIds, nextOrderedIds)) {
      this.orderedIds = nextOrderedIds
      this.orderedIdSet = new Set(nextOrderedIds)
      this.orderDirty = true
      changed = true
    }

    if (changed) {
      this.orderDirty = true
    }

    this.syncProjectedEntries(new Set(nextOrderedIds))
    return changed
  }

  private syncByNodeIds = (
    nodeIds: Iterable<NodeId>,
    nodeById: ReadonlyMap<NodeId, Node>
  ): boolean => {
    const removed = new Set<NodeId>()
    let changed = false
    const affectedIds = new Set<NodeId>()

    for (const nodeId of nodeIds) {
      affectedIds.add(nodeId)
      const node = nodeById.get(nodeId)
      if (!node) {
        if (this.geometry.delete(nodeId)) {
          changed = true
        }
        if (this.orderedIdSet.has(nodeId)) {
          removed.add(nodeId)
          this.orderDirty = true
        }
        continue
      }

      if (this.geometry.update(node)) {
        changed = true
      }
      if (!this.orderedIdSet.has(nodeId)) {
        this.orderedIds.push(nodeId)
        this.orderedIdSet.add(nodeId)
        this.orderDirty = true
      }
    }

    if (removed.size) {
      this.orderedIds = this.orderedIds.filter((nodeId) => !removed.has(nodeId))
      removed.forEach((nodeId) => {
        this.orderedIdSet.delete(nodeId)
      })
      removed.forEach((nodeId) => {
        this.entriesById.delete(nodeId)
      })
    }

    if (changed) {
      this.orderDirty = true
    }

    return this.syncProjectedEntries(affectedIds) || changed
  }

  changedIds = (): readonly NodeId[] => this.dirtyIds

  private resolveGroupEntry = (
    current: CanvasNode,
    _affectedIds: ReadonlySet<NodeId>,
    _cache: Map<NodeId, CanvasNode>,
    _visited: Set<NodeId>,
    _resolveEntry: (nodeId: NodeId) => CanvasNode | undefined
  ): CanvasNode => current

  private isSameEntry = (
    left: CanvasNode | undefined,
    right: CanvasNode | undefined
  ) => (
    left === right
    || (
      left?.node === right?.node
      && left?.geometry.rect.x === right?.geometry.rect.x
      && left?.geometry.rect.y === right?.geometry.rect.y
      && left?.geometry.rect.width === right?.geometry.rect.width
      && left?.geometry.rect.height === right?.geometry.rect.height
      && left?.geometry.bounds.x === right?.geometry.bounds.x
      && left?.geometry.bounds.y === right?.geometry.bounds.y
      && left?.geometry.bounds.width === right?.geometry.bounds.width
      && left?.geometry.bounds.height === right?.geometry.bounds.height
    )
  )

  private syncProjectedEntries = (
    affectedIds: ReadonlySet<NodeId>
  ): boolean => {
    if (!affectedIds.size) {
      this.dirtyIds = []
      return false
    }

    const cache = new Map<NodeId, CanvasNode>()
    const visited = new Set<NodeId>()
    const changedIds: NodeId[] = []

    const resolveEntry = (
      nodeId: NodeId
    ): CanvasNode | undefined => {
      if (cache.has(nodeId)) {
        return cache.get(nodeId)
      }

      const current = this.geometry.get(nodeId)
      if (!current) {
        return undefined
      }

      const next = this.resolveGroupEntry(
        current,
        affectedIds,
        cache,
        visited,
        resolveEntry
      )
      cache.set(nodeId, next)
      return next
    }

    affectedIds.forEach((nodeId) => {
      const next = resolveEntry(nodeId)
      const prev = this.entriesById.get(nodeId)

      if (!next) {
        if (prev) {
          this.entriesById.delete(nodeId)
          changedIds.push(nodeId)
        }
        return
      }

      if (!this.isSameEntry(prev, next)) {
        this.entriesById.set(nodeId, next)
        changedIds.push(nodeId)
      } else if (prev !== next) {
        this.entriesById.set(nodeId, next)
      }
    })

    if (changedIds.length > 0) {
      this.orderDirty = true
      this.dirtyIds = changedIds
      return true
    }

    this.dirtyIds = []
    return false
  }

  all = (): CanvasNode[] => {
    if (!this.orderDirty) return this.orderedEntries
    this.orderedEntries = this.orderedIds
      .map((id) => this.entriesById.get(id))
      .filter((entry): entry is CanvasNode => Boolean(entry))
    this.orderDirty = false
    return this.orderedEntries
  }

  nodeIdsInRect = (
    rect: Rect,
    options?: NodeRectHitOptions
  ): NodeId[] => getNodeIdsInRectRaw(
    rect,
    this.all().map((entry) => ({
      node: entry.node,
      rect: entry.geometry.rect,
      rotation: readNodeRotation(entry.node)
    })),
    options
  )

  byId = (nodeId: NodeId): CanvasNode | undefined =>
    this.entriesById.get(nodeId)
}

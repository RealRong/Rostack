import type { CanvasNode } from '@engine-types/projection'
import type { Node, NodeId, Rect } from '@whiteboard/core/types'
import {
  getNodeOutlineBounds,
  getNodeIdsInRect as getNodeIdsInRectRaw,
  type NodeRectHitOptions
} from '@whiteboard/core/node'
import type { BoardConfig } from '@engine-types/instance'
import type { ReadModel } from '@engine-types/read'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import { isSameRefOrder } from '@whiteboard/core/utils'
import { NodeGeometryCache } from '../../geometry/nodeGeometry'
import { TreeIndex } from './tree'

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
    model: ReadModel,
    tree: Pick<TreeIndex, 'ancestors' | 'childrenOf'>
  ): boolean => {
    this.dirtyIds = []
    const rebuild = resolveRebuild(impact)
    switch (rebuild) {
      case 'none':
        return false
      case 'full':
        return this.syncFull(model.nodes.canvas, tree)
      case 'dirty':
        return this.syncByNodeIds(
          impact.node.ids,
          model.canvas.nodeById,
          tree
        )
      default:
        return false
    }
  }

  private syncFull = (
    nodes: Node[],
    tree: Pick<TreeIndex, 'ancestors' | 'childrenOf'>
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

    this.syncProjectedEntries(
      new Set(nextOrderedIds),
      tree
    )
    return changed
  }

  private syncByNodeIds = (
    nodeIds: Iterable<NodeId>,
    nodeById: ReadonlyMap<NodeId, Node>,
    tree: Pick<TreeIndex, 'ancestors' | 'childrenOf'>
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

      tree.ancestors(nodeId).forEach((ownerId) => {
        affectedIds.add(ownerId)
      })
    }

    for (const nodeId of affectedIds) {
      tree.ancestors(nodeId).forEach((ownerId) => {
        affectedIds.add(ownerId)
      })
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

    return this.syncProjectedEntries(affectedIds, tree) || changed
  }

  changedIds = (): readonly NodeId[] => this.dirtyIds

  private resolveGroupEntry = (
    current: CanvasNode,
    tree: Pick<TreeIndex, 'childrenOf'>,
    affectedIds: ReadonlySet<NodeId>,
    cache: Map<NodeId, CanvasNode>,
    visited: Set<NodeId>,
    resolveEntry: (nodeId: NodeId) => CanvasNode | undefined
  ): CanvasNode => {
    if (current.node.type !== 'group') {
      return current
    }

    if (visited.has(current.node.id)) {
      return current
    }

    visited.add(current.node.id)
    const childRects = tree.childrenOf(current.node.id)
      .map((childId) => (
        affectedIds.has(childId)
          ? resolveEntry(childId)
          : this.entriesById.get(childId) ?? this.geometry.get(childId)
      ))
      .filter((entry): entry is CanvasNode => Boolean(entry))
      .map((entry) => (
        entry.node.type === 'shape'
          ? getNodeOutlineBounds(entry.node, entry.rect, entry.rotation)
          : entry.aabb
      ))
    visited.delete(current.node.id)

    if (!childRects.length) {
      return current
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    childRects.forEach((rect) => {
      minX = Math.min(minX, rect.x)
      minY = Math.min(minY, rect.y)
      maxX = Math.max(maxX, rect.x + rect.width)
      maxY = Math.max(maxY, rect.y + rect.height)
    })

    const rect: Rect = {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY)
    }

    return {
      node: current.node,
      rect,
      aabb: rect,
      rotation: 0
    }
  }

  private isSameEntry = (
    left: CanvasNode | undefined,
    right: CanvasNode | undefined
  ) => (
    left === right
    || (
      left?.node === right?.node
      && left?.rotation === right?.rotation
      && left?.rect.x === right?.rect.x
      && left?.rect.y === right?.rect.y
      && left?.rect.width === right?.rect.width
      && left?.rect.height === right?.rect.height
      && left?.aabb.x === right?.aabb.x
      && left?.aabb.y === right?.aabb.y
      && left?.aabb.width === right?.aabb.width
      && left?.aabb.height === right?.aabb.height
    )
  )

  private syncProjectedEntries = (
    affectedIds: ReadonlySet<NodeId>,
    tree: Pick<TreeIndex, 'childrenOf'>
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
        tree,
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
  ): NodeId[] => getNodeIdsInRectRaw(rect, this.all(), options)

  byId = (nodeId: NodeId): CanvasNode | undefined =>
    this.entriesById.get(nodeId)
}

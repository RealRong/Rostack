import type { CanvasNode } from '@whiteboard/engine/types/projection'
import type { MindmapId, Node, NodeId, Rect } from '@whiteboard/core/types'
import { node as nodeApi } from '@whiteboard/core/node'
import type { NodeRectHitOptions } from '@whiteboard/core/node/hitTest'
import type { BoardConfig } from '@whiteboard/engine/types/instance'
import type { ReadModel } from '@whiteboard/engine/types/read'
import type { Invalidation } from '@whiteboard/core/types'
import { equal } from '@shared/core'
import { NodeGeometryCache } from '@whiteboard/engine/geometry/nodeGeometry'

type Rebuild = 'none' | 'dirty' | 'full'

type OwnerGeometryResolver = {
  readMindmapNodeIds?: (mindmapId: MindmapId) => readonly NodeId[] | undefined
  readMindmapRect?: (mindmapId: MindmapId, nodeId: NodeId) => Rect | undefined
}

const resolveRebuild = (invalidation: Invalidation): Rebuild => {
  if (invalidation.document || invalidation.canvasOrder) {
    return 'full'
  }
  if (invalidation.nodes.size > 0 || invalidation.mindmaps.size > 0) {
    return 'dirty'
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

  constructor(
    config: BoardConfig,
    private ownerGeometry?: OwnerGeometryResolver
  ) {
    this.geometry = new NodeGeometryCache(config.nodeSize)
  }

  applyChange = (
    invalidation: Invalidation,
    model: ReadModel
  ): boolean => {
    this.dirtyIds = []
    const rebuild = resolveRebuild(invalidation)
    switch (rebuild) {
      case 'none':
        return false
      case 'full':
        return this.syncFull(model.nodes.canvas)
      case 'dirty':
        return this.syncByNodeIds(
          invalidation.nodes,
          model.canvas.nodeById,
          invalidation.mindmaps
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

    if (!equal.sameOrder(this.orderedIds, nextOrderedIds)) {
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
    nodeById: ReadonlyMap<NodeId, Node>,
    mindmapIds: Iterable<MindmapId>
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

    for (const mindmapId of mindmapIds) {
      this.ownerGeometry?.readMindmapNodeIds?.(mindmapId)?.forEach((nodeId) => {
        affectedIds.add(nodeId)
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

    return this.syncProjectedEntries(affectedIds) || changed
  }

  changedIds = (): readonly NodeId[] => this.dirtyIds

  private resolveGroupEntry = (
    current: CanvasNode,
    _affectedIds: ReadonlySet<NodeId>,
    _cache: Map<NodeId, CanvasNode>,
    _visited: Set<NodeId>,
    _resolveEntry: (nodeId: NodeId) => CanvasNode | undefined
  ): CanvasNode => {
    const mindmapId = current.node.owner?.kind === 'mindmap'
      ? current.node.owner.id
      : undefined
    if (!mindmapId) {
      return current
    }

    const rect = this.ownerGeometry?.readMindmapRect?.(mindmapId, current.node.id)
    if (!rect) {
      return current
    }

    const rotation = nodeApi.geometry.rotation(current.node)
    const geometry = nodeApi.outline.geometry(
      current.node,
      rect,
      rotation
    )

    return (
      equal.sameRect(current.geometry.rect, geometry.rect)
      && equal.sameRect(current.geometry.bounds, geometry.bounds)
    )
      ? current
      : {
          node: current.node,
          geometry
        }
  }

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
  ): NodeId[] => nodeApi.hit.idsInRect(
    rect,
    this.all().map((entry) => ({
      node: entry.node,
      rect: entry.geometry.rect,
      rotation: nodeApi.geometry.rotation(entry.node)
    })),
    options
  )

  byId = (nodeId: NodeId): CanvasNode | undefined =>
    this.entriesById.get(nodeId)
}

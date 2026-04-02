import type { Node, NodeId, Rect, Size } from '@whiteboard/core/types'
import { getNodeAABB, getNodeRect } from '@whiteboard/core/geometry'
import { isSameRectWithRotationTuple, toFiniteOrUndefined } from '@whiteboard/core/utils'

type NodeGeometryStateTuple = {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
}

type NodeGeometryCacheEntry = {
  state: NodeGeometryStateTuple
  entry: NodeGeometryEntry
}

type NodeGeometryEntry = {
  node: Node
  rect: Rect
  aabb: Rect
  rotation: number
}

export class NodeGeometryCache {
  private entriesById = new Map<NodeId, NodeGeometryCacheEntry>()

  constructor(private nodeSize: Size) {}

  private toStateTuple = (node: Node): NodeGeometryStateTuple => {
    if (node.type === 'group') {
      return {
        rotation: 0
      }
    }

    const rect = getNodeRect(node, this.nodeSize)
    return {
      x: toFiniteOrUndefined(rect.x),
      y: toFiniteOrUndefined(rect.y),
      width: toFiniteOrUndefined(rect.width),
      height: toFiniteOrUndefined(rect.height),
      rotation: toFiniteOrUndefined(node.rotation ?? 0)
    }
  }

  private toEntry = (node: Node): NodeGeometryEntry => (
    node.type === 'group'
      ? {
          node,
          rect: {
            x: 0,
            y: 0,
            width: 0,
            height: 0
          },
          aabb: {
            x: 0,
            y: 0,
            width: 0,
            height: 0
          },
          rotation: 0
        }
      : {
          node,
          rect: getNodeRect(node, this.nodeSize),
          aabb: getNodeAABB(node, this.nodeSize),
          rotation: typeof node.rotation === 'number' ? node.rotation : 0
        }
  )

  update = (node: Node): boolean => {
    const state = this.toStateTuple(node)
    const current = this.entriesById.get(node.id)
    if (
      current &&
      current.entry.node === node &&
      isSameRectWithRotationTuple(current.state, state)
    ) {
      return false
    }

    this.entriesById.set(node.id, {
      state,
      entry: this.toEntry(node)
    })
    return true
  }

  delete = (nodeId: NodeId): boolean => {
    if (!this.entriesById.has(nodeId)) return false
    this.entriesById.delete(nodeId)
    return true
  }

  get = (nodeId: NodeId): NodeGeometryEntry | undefined =>
    this.entriesById.get(nodeId)?.entry

  syncFull = (nodes: readonly Node[]): boolean => {
    const seen = new Set<NodeId>()
    let changed = false

    nodes.forEach((node) => {
      seen.add(node.id)
      if (this.update(node)) {
        changed = true
      }
    })

    this.entriesById.forEach((_, nodeId) => {
      if (seen.has(nodeId)) return
      this.entriesById.delete(nodeId)
      changed = true
    })

    return changed
  }

  syncByNodeIds = (
    nodeIds: Iterable<NodeId>,
    getNode: (nodeId: NodeId) => Node | undefined
  ): boolean => {
    let changed = false
    for (const nodeId of nodeIds) {
      const node = getNode(nodeId)
      if (!node) {
        if (this.delete(nodeId)) {
          changed = true
        }
        continue
      }
      if (this.update(node)) {
        changed = true
      }
    }
    return changed
  }
}

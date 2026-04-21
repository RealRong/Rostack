import type { Node, NodeGeometry, NodeId, Rect, Size } from '@whiteboard/core/types'
import { node as nodeApi } from '@whiteboard/core/node'
import { equal } from '@shared/core'


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
  geometry: NodeGeometry
}

export class NodeGeometryCache {
  private entriesById = new Map<NodeId, NodeGeometryCacheEntry>()

  constructor(private nodeSize: Size) {}

  private toStateTuple = (node: Node): NodeGeometryStateTuple => {
    const rect = nodeApi.geometry.rect(node, this.nodeSize)
    return {
      x: equal.toFiniteOrUndefined(rect.x),
      y: equal.toFiniteOrUndefined(rect.y),
      width: equal.toFiniteOrUndefined(rect.width),
      height: equal.toFiniteOrUndefined(rect.height),
      rotation: equal.toFiniteOrUndefined(node.rotation ?? 0)
    }
  }

  private toEntry = (node: Node): NodeGeometryEntry => ({
    node,
    geometry: nodeApi.outline.geometry(
      node,
      nodeApi.geometry.rect(node, this.nodeSize),
      nodeApi.geometry.rotation(node)
    )
  })

  update = (node: Node): boolean => {
    const state = this.toStateTuple(node)
    const current = this.entriesById.get(node.id)
    if (
      current &&
      current.entry.node === node &&
      equal.sameRectWithRotation(current.state, state)
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

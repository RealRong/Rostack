import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type { NodeItem } from '#types/projection'
import type { NodeId } from '@whiteboard/core/types'
import type { ReadSnapshot } from '#types/internal/read'
import { createProjectionRuntime } from './projection'

export const createNodeProjection = (initialSnapshot: ReadSnapshot) => {
  const cacheById = new Map<NodeId, NodeItem>()
  const projection = createProjectionRuntime<NodeId, NodeItem | undefined>({
    initialList: initialSnapshot.model.canvas.nodeIds as readonly NodeId[],
    emptyValue: undefined,
    read: (nodeId) => readCached(nodeId)
  })
  let snapshotRef: ReadSnapshot = initialSnapshot

  const getNodeMap = () => snapshotRef.model.canvas.nodeById

  const readEntry = (
    nodeId: NodeId,
    previous?: NodeItem
  ) => {
    const node = getNodeMap().get(nodeId)
    const canvasNode = snapshotRef.index.node.get(nodeId)
    if (!node || !canvasNode) {
      return undefined
    }

    if (
      previous
      && previous.node === node
      && previous.rect === canvasNode.geometry.rect
    ) {
      return previous
    }

    return {
      node,
      rect: canvasNode.geometry.rect
    } satisfies NodeItem
  }

  const readCached = (
    nodeId: NodeId
  ) => {
    const next = readEntry(nodeId, cacheById.get(nodeId))
    if (next) {
      cacheById.set(nodeId, next)
    } else {
      cacheById.delete(nodeId)
    }
    return next
  }

  const applyChange = (
    impact: KernelReadImpact,
    snapshot: ReadSnapshot,
    extraChangedNodeIds: readonly NodeId[] = []
  ) => {
    snapshotRef = snapshot
    const prevIds = projection.list.get()
    const nextIds = snapshotRef.model.canvas.nodeIds as readonly NodeId[]
    const idsChanged = prevIds !== nextIds

    if (idsChanged) {
      projection.setList(nextIds)
    }

    const changedNodeIds = new Set<NodeId>()

    if (
      impact.reset
      || impact.node.list
      || ((impact.node.geometry || impact.node.value) && impact.node.ids.length === 0)
    ) {
      cacheById.forEach((_, nodeId) => {
        changedNodeIds.add(nodeId)
      })
      for (const nodeId of projection.trackedKeys()) {
        changedNodeIds.add(nodeId)
      }
    } else {
      impact.node.ids.forEach((nodeId) => {
        changedNodeIds.add(nodeId)
      })
    }

    extraChangedNodeIds.forEach((nodeId) => {
      changedNodeIds.add(nodeId)
    })

    if (idsChanged) {
      prevIds.forEach((nodeId) => {
        if (!snapshotRef.model.canvas.nodeById.has(nodeId)) {
          changedNodeIds.add(nodeId)
        }
      })
    }

    projection.sync(changedNodeIds)
  }

  return {
    list: projection.list,
    item: projection.item,
    applyChange
  }
}

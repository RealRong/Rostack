import type { ReadModel } from '@engine-types/read'
import type { NodeId } from '@whiteboard/core/types'

const EMPTY_IDS: readonly NodeId[] = []
const EMPTY_SET: ReadonlySet<NodeId> = new Set<NodeId>()

export class TreeIndex {
  private nodeById: ReadModel['canvas']['nodeById'] = new Map()
  private allIds: readonly NodeId[] = EMPTY_IDS
  private ownerById = new Map<NodeId, NodeId>()
  private children = new Map<NodeId, NodeId[]>()
  private idsCache = new Map<NodeId, readonly NodeId[]>()
  private setCache = new Map<NodeId, ReadonlySet<NodeId>>()
  private ancestorsCache = new Map<NodeId, readonly NodeId[]>()

  applyChange = (model: ReadModel) => {
    const nextNodeById = model.canvas.nodeById
    const nextIds = model.canvas.nodeIds

    if (this.nodeById === nextNodeById && this.allIds === nextIds) {
      return
    }

    this.nodeById = nextNodeById
    this.allIds = nextIds
    this.ownerById = new Map()
    this.children = new Map()
    this.idsCache.clear()
    this.setCache.clear()
    this.ancestorsCache.clear()

    nextIds.forEach((nodeId) => {
      const node = nextNodeById.get(nodeId)
      if (!node) return

      node.children?.forEach((childId) => {
        const children = this.children.get(node.id) ?? []
        children.push(childId)
        this.children.set(node.id, children)
        this.ownerById.set(childId, node.id)
      })
    })
  }

  owner = (nodeId: NodeId): NodeId | undefined => this.ownerById.get(nodeId)

  childrenOf = (ownerId: NodeId): readonly NodeId[] =>
    this.children.get(ownerId) ?? EMPTY_IDS

  ancestors = (nodeId: NodeId): readonly NodeId[] => {
    const cached = this.ancestorsCache.get(nodeId)
    if (cached) {
      return cached
    }

    const ancestors: NodeId[] = []
    let current = this.ownerById.get(nodeId)

    while (current) {
      ancestors.push(current)
      current = this.ownerById.get(current)
    }

    const result = ancestors.length > 0 ? ancestors : EMPTY_IDS
    this.ancestorsCache.set(nodeId, result)
    return result
  }

  ids = (rootId: NodeId): readonly NodeId[] => {
    const cached = this.idsCache.get(rootId)
    if (cached) {
      return cached
    }

    const ids = this.readIds(rootId)
    this.idsCache.set(rootId, ids)
    return ids
  }

  private readIds = (rootId: NodeId): readonly NodeId[] => {
    const set = this.readSet(rootId)
    if (set.size === 0) {
      return EMPTY_IDS
    }

    const ids = this.allIds.filter((nodeId) => set.has(nodeId))
    return ids.length > 0 ? ids : EMPTY_IDS
  }

  private readSet = (rootId: NodeId): ReadonlySet<NodeId> => {
    const cached = this.setCache.get(rootId)
    if (cached) {
      return cached
    }

    if (!this.nodeById.has(rootId)) {
      this.setCache.set(rootId, EMPTY_SET)
      return EMPTY_SET
    }

    const set = new Set<NodeId>()
    const stack = [...this.childrenOf(rootId)]

    while (stack.length > 0) {
      const nodeId = stack.pop()
      if (!nodeId || set.has(nodeId)) {
        continue
      }

      set.add(nodeId)
      this.childrenOf(nodeId).forEach((childId) => {
        stack.push(childId)
      })
    }

    const result = set.size > 0 ? set : EMPTY_SET
    this.setCache.set(rootId, result)
    return result
  }
}

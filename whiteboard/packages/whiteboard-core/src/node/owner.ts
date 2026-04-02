import type {
  Document,
  Node,
  NodeId,
  Operation,
  Result
} from '../types'
import { err, listNodes, ok } from '../types'
import { createNodeFieldsUpdateOperation } from './update'

const EMPTY_NODE_IDS: readonly NodeId[] = []
type OwnedNode = Pick<Node, 'id' | 'children'>

export const readChildren = (
  node: Pick<Node, 'children'> | undefined
): readonly NodeId[] => node?.children ?? EMPTY_NODE_IDS

export const equalChildren = (
  left: readonly NodeId[] | undefined,
  right: readonly NodeId[] | undefined
) => {
  if (left === right) {
    return true
  }

  const nextLeft = left ?? EMPTY_NODE_IDS
  const nextRight = right ?? EMPTY_NODE_IDS
  if (nextLeft.length !== nextRight.length) {
    return false
  }

  return nextLeft.every((id, index) => id === nextRight[index])
}

export const replaceChildren = (
  current: readonly NodeId[],
  removeIds: ReadonlySet<NodeId>,
  insertedIds: readonly NodeId[]
) => {
  const firstIndex = current.findIndex((childId) => removeIds.has(childId))
  const next = current.filter((childId) => !removeIds.has(childId))

  if (firstIndex < 0) {
    return [
      ...next,
      ...insertedIds
    ]
  }

  return [
    ...next.slice(0, firstIndex),
    ...insertedIds,
    ...next.slice(firstIndex)
  ]
}

export const patchChildren = (
  node: Node | undefined,
  children: readonly NodeId[]
): Extract<Operation, { type: 'node.update' }> | undefined => {
  if (!node || equalChildren(node.children, children)) {
    return undefined
  }

  return createNodeFieldsUpdateOperation(node.id, {
    children: [...children]
  })
}

export const getNodeOwnerMap = (
  nodes: readonly Pick<Node, 'id' | 'children'>[]
): ReadonlyMap<NodeId, NodeId> => {
  const ownerByChildId = new Map<NodeId, NodeId>()

  nodes.forEach((node) => {
    readChildren(node).forEach((childId) => {
      ownerByChildId.set(childId, node.id)
    })
  })

  return ownerByChildId
}

const toNodeById = <TNode extends Pick<Node, 'id'>>(
  nodes: readonly TNode[]
): ReadonlyMap<NodeId, TNode> =>
  new Map(nodes.map((node) => [node.id, node]))

const getDirectChildren = <TNode extends OwnedNode>(
  nodesById: ReadonlyMap<NodeId, TNode>,
  ownerId: NodeId
): TNode[] => {
  const owner = nodesById.get(ownerId)
  if (!owner) {
    return []
  }

  return readChildren(owner)
    .map((childId) => nodesById.get(childId))
    .filter((child): child is TNode => Boolean(child))
}

export const getOwnerChildrenMap = <TNode extends OwnedNode>(
  nodes: readonly TNode[],
  matchOwner?: (node: TNode) => boolean
) => {
  const nodesById = toNodeById(nodes)
  const map = new Map<NodeId, TNode[]>()

  nodes.forEach((node) => {
    if (matchOwner && !matchOwner(node)) {
      return
    }

    const children = getDirectChildren(nodesById, node.id)
    if (children.length > 0) {
      map.set(node.id, children)
    }
  })

  return map
}

export const getOwnerDescendants = <TNode extends OwnedNode>(
  nodes: readonly TNode[],
  ownerId: NodeId
): TNode[] => {
  const nodesById = toNodeById(nodes)
  const result: TNode[] = []
  const visited = new Set<NodeId>()
  const stack = [...getDirectChildren(nodesById, ownerId)].reverse()

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || visited.has(node.id)) {
      continue
    }

    visited.add(node.id)
    result.push(node)

    const children = getDirectChildren(nodesById, node.id)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]!)
    }
  }

  return result
}

const hasSelectedAncestor = (
  nodeId: NodeId,
  selectedIds: ReadonlySet<NodeId>,
  ownerByChildId: ReadonlyMap<NodeId, NodeId>
) => {
  let current = ownerByChildId.get(nodeId)

  while (current) {
    if (selectedIds.has(current)) {
      return true
    }
    current = ownerByChildId.get(current)
  }

  return false
}

export const filterRootIds = <TNode extends OwnedNode>(
  nodes: readonly TNode[],
  ids: readonly NodeId[]
): NodeId[] => {
  if (!ids.length) {
    return []
  }

  const nodesById = toNodeById(nodes)
  const ownerByChildId = getNodeOwnerMap(nodes)
  const uniqueIds = Array.from(new Set(ids)).filter((id) => nodesById.has(id))
  if (!uniqueIds.length) {
    return []
  }

  const selectedIds = new Set(uniqueIds)
  return uniqueIds.filter((id) => !hasSelectedAncestor(id, selectedIds, ownerByChildId))
}

export const findOwnerAncestor = <
  TNode extends Pick<Node, 'id'>
>(
  nodeId: NodeId,
  readNode: (nodeId: NodeId) => TNode | undefined,
  readOwnerId: (nodeId: NodeId) => NodeId | undefined,
  match: (ownerId: NodeId, owner: TNode) => boolean
) => {
  let currentId: NodeId | undefined = nodeId

  while (currentId) {
    const ownerId = readOwnerId(currentId)
    if (!ownerId) {
      return undefined
    }

    const owner = readNode(ownerId)
    if (!owner) {
      return undefined
    }

    if (match(owner.id, owner)) {
      return owner.id
    }

    currentId = owner.id
  }

  return undefined
}

export const createOwnerDepthResolver = <TNode extends Pick<Node, 'id'>>({
  readNode,
  readOwnerId,
  include
}: {
  readNode: (nodeId: NodeId) => TNode | undefined
  readOwnerId: (nodeId: NodeId) => NodeId | undefined
  include: (node: TNode) => boolean
}) => {
  const depthById = new Map<NodeId, number>()

  const resolveDepth = (nodeId: NodeId): number => {
    const cached = depthById.get(nodeId)
    if (cached !== undefined) {
      return cached
    }

    const ownerId = readOwnerId(nodeId)
    const owner = ownerId ? readNode(ownerId) : undefined
    const depth = owner && include(owner)
      ? resolveDepth(owner.id) + 1
      : 0
    depthById.set(nodeId, depth)
    return depth
  }

  return resolveDepth
}

type OwnerChange = {
  id: NodeId
  ownerId?: NodeId
}

export type OwnerState = {
  owner: (nodeId: NodeId) => NodeId | undefined
  children: (ownerId: NodeId) => readonly NodeId[]
  setOwner: (nodeId: NodeId, ownerId?: NodeId) => Result<void, 'invalid'>
  replace: (
    ownerId: NodeId,
    removeIds: ReadonlySet<NodeId>,
    insertedIds: readonly NodeId[]
  ) => Result<void, 'invalid'>
  removeNode: (nodeId: NodeId) => void
  patches: (skipOwnerIds?: ReadonlySet<NodeId>) => Operation[]
}

const isOwnerNode = (
  node: Pick<Node, 'type'>
) => node.type === 'group'

export const createOwnerState = (
  document: Document
): OwnerState => {
  const nodes = listNodes(document)
  const nodeById = new Map<NodeId, Node>(nodes.map((node) => [node.id, node]))
  const ownerByChildId = new Map(getNodeOwnerMap(nodes))
  const nextChildrenByOwner = new Map<NodeId, NodeId[]>()
  const dirtyOwnerIds = new Set<NodeId>()

  const ensureOwner = (
    ownerId: NodeId
  ): Result<Node, 'invalid'> => {
    const owner = nodeById.get(ownerId)
    if (!owner) {
      return err('invalid', `Owner ${ownerId} not found.`)
    }
    if (!isOwnerNode(owner)) {
      return err('invalid', `Node ${ownerId} is not an owner.`)
    }
    return ok(owner)
  }

  const readNextChildren = (
    ownerId: NodeId
  ) => {
    const cached = nextChildrenByOwner.get(ownerId)
    if (cached) {
      return cached
    }

    const next = [...readChildren(nodeById.get(ownerId))]
    nextChildrenByOwner.set(ownerId, next)
    return next
  }

  const markChildren = (
    ownerId: NodeId,
    nextChildren: readonly NodeId[]
  ) => {
    nextChildrenByOwner.set(ownerId, [...nextChildren])
    dirtyOwnerIds.add(ownerId)
  }

  const replaceOwnerChildren = (
    ownerId: NodeId,
    removeIds: ReadonlySet<NodeId>,
    insertedIds: readonly NodeId[]
  ): Result<void, 'invalid'> => {
    const owner = ensureOwner(ownerId)
    if (!owner.ok) {
      return owner
    }

    const currentChildren = readNextChildren(ownerId)
    const nextChildren = replaceChildren(currentChildren, removeIds, insertedIds)
    const nextSet = new Set(nextChildren)

    currentChildren.forEach((childId) => {
      if (ownerByChildId.get(childId) !== ownerId) {
        return
      }
      if (!nextSet.has(childId)) {
        ownerByChildId.delete(childId)
      }
    })

    insertedIds.forEach((childId) => {
      if (nextSet.has(childId)) {
        ownerByChildId.set(childId, ownerId)
      }
    })

    markChildren(ownerId, nextChildren)
    return ok(undefined)
  }

  const setOwner = (
    nodeId: NodeId,
    ownerId?: NodeId
  ): Result<void, 'invalid'> => {
    const currentOwnerId = ownerByChildId.get(nodeId)
    if (currentOwnerId === ownerId) {
      return ok(undefined)
    }

    if (currentOwnerId) {
      const detached = replaceOwnerChildren(
        currentOwnerId,
        new Set([nodeId]),
        []
      )
      if (!detached.ok) {
        return detached
      }
    } else {
      ownerByChildId.delete(nodeId)
    }

    if (!ownerId) {
      return ok(undefined)
    }

    return replaceOwnerChildren(
      ownerId,
      new Set<NodeId>(),
      [nodeId]
    )
  }

  const removeNode = (
    nodeId: NodeId
  ) => {
    ownerByChildId.delete(nodeId)
    nextChildrenByOwner.delete(nodeId)
    dirtyOwnerIds.delete(nodeId)
  }

  const patches = (
    skipOwnerIds: ReadonlySet<NodeId> = new Set()
  ) => Array.from(dirtyOwnerIds).flatMap((ownerId) => {
    if (skipOwnerIds.has(ownerId)) {
      return []
    }

    const owner = nodeById.get(ownerId)
    if (!owner) {
      return []
    }

    const nextChildren = nextChildrenByOwner.get(ownerId) ?? [...readChildren(owner)]
    const patch = patchChildren(owner, nextChildren)
    return patch ? [patch] : []
  })

  return {
    owner: (nodeId) => ownerByChildId.get(nodeId),
    children: (ownerId) => readNextChildren(ownerId),
    setOwner,
    replace: replaceOwnerChildren,
    removeNode,
    patches
  }
}

export const buildOwnerOps = ({
  document,
  changes
}: {
  document: Document
  changes: readonly OwnerChange[]
}): Result<Operation[], 'invalid'> => {
  if (!changes.length) {
    return ok([])
  }

  const state = createOwnerState(document)

  for (const change of changes) {
    const result = state.setOwner(change.id, change.ownerId)
    if (!result.ok) {
      return result
    }
  }

  return ok(state.patches())
}

export const buildDeleteOwnerOps = ({
  document,
  ids
}: {
  document: Document
  ids: readonly NodeId[]
}): Result<Operation[], 'invalid'> => {
  if (!ids.length) {
    return ok([])
  }

  const deletedIds = new Set(ids)
  const state = createOwnerState(document)

  for (const nodeId of deletedIds) {
    const ownerId = state.owner(nodeId)
    if (!ownerId || deletedIds.has(ownerId)) {
      continue
    }

    const result = state.setOwner(nodeId, undefined)
    if (!result.ok) {
      return result
    }
  }

  return ok(state.patches(deletedIds))
}

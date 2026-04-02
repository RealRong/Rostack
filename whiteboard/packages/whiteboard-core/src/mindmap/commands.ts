import { err, ok } from '../types'
import { applyPathMutation } from '../utils'
import type {
  MindmapCommandResult,
  MindmapCloneSubtreeInput,
  MindmapDataMutation,
  MindmapIdGenerator,
  MindmapInsertInput,
  MindmapMoveSubtreeInput,
  MindmapNode,
  MindmapNodeData,
  MindmapNodeId,
  MindmapNodeUpdateInput,
  MindmapRemoveSubtreeInput,
  MindmapTree,
  MindmapUpdateNodeInput
} from './types'
import type { MindmapInsertPayload } from '../types/mindmap'
import { createId } from '../utils/id'

type TreeDraft = MindmapTree

const createFailure = (message: string) => err('invalid', message)

const getDefaultNodeId = () => createId('mnode')
const getDefaultTreeId = () => createId('mindmap')

const cloneTree = (tree: MindmapTree): TreeDraft => ({
  ...tree,
  nodes: { ...tree.nodes },
  children: Object.fromEntries(Object.entries(tree.children).map(([id, list]) => [id, [...list]])),
  meta: tree.meta ? { ...tree.meta } : undefined
})

const ensureChildren = (tree: TreeDraft, id: MindmapNodeId) => {
  if (!tree.children[id]) {
    tree.children[id] = []
  }
  return tree.children[id]
}

const ensureNode = (tree: MindmapTree, id: MindmapNodeId) => tree.nodes[id]

const updateMeta = (tree: TreeDraft, timestamp = new Date().toISOString()) => {
  if (!tree.meta) {
    tree.meta = { createdAt: timestamp, updatedAt: timestamp }
  } else {
    if (!tree.meta.createdAt) tree.meta.createdAt = timestamp
    tree.meta.updatedAt = timestamp
  }
}

const applyDataMutation = (
  current: unknown,
  mutation: MindmapDataMutation
): { ok: true; value: unknown } | { ok: false; message: string } => {
  return applyPathMutation(current, mutation)
}

const collectSubtreeIds = (tree: MindmapTree, rootId: MindmapNodeId) => {
  const result: MindmapNodeId[] = []
  const stack: MindmapNodeId[] = [rootId]
  const visited = new Set<MindmapNodeId>()
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    result.push(current)
    const children = tree.children[current] ?? []
    children.forEach((childId) => stack.push(childId))
  }
  return result
}

const isAncestorOf = (tree: MindmapTree, ancestorId: MindmapNodeId, nodeId: MindmapNodeId) => {
  let current = tree.nodes[nodeId]?.parentId
  while (current) {
    if (current === ancestorId) return true
    current = tree.nodes[current]?.parentId
  }
  return false
}

const normalizeMoveIndex = ({
  prevParentId,
  nextParentId,
  prevIndex,
  requestedIndex
}: {
  prevParentId: MindmapNodeId
  nextParentId: MindmapNodeId
  prevIndex: number
  requestedIndex: number | undefined
}) => {
  if (typeof requestedIndex !== 'number') return requestedIndex
  if (prevParentId !== nextParentId) return requestedIndex
  if (prevIndex < 0) return requestedIndex
  if (requestedIndex <= prevIndex) return requestedIndex
  return Math.max(0, requestedIndex - 1)
}

export const createMindmap = (
  options: {
    id?: MindmapTree['id']
    rootId?: MindmapNodeId
    rootData?: MindmapNodeData
    idGenerator?: MindmapIdGenerator
  } = {}
): MindmapTree => {
  const createTreeId = options.idGenerator?.treeId ?? getDefaultTreeId
  const createNodeId = options.idGenerator?.nodeId ?? getDefaultNodeId
  const id = options.id ?? createTreeId()
  const rootId = options.rootId ?? createNodeId()
  const rootNode: MindmapNode = {
    id: rootId,
    data: options.rootData ?? { kind: 'text', text: '' }
  }
  const now = new Date().toISOString()
  return {
    id,
    rootId,
    nodes: { [rootId]: rootNode },
    children: { [rootId]: [] },
    meta: { createdAt: now, updatedAt: now }
  }
}

export const addChild = (
  tree: MindmapTree,
  parentId: MindmapNodeId,
  payload?: MindmapNodeData | MindmapInsertPayload,
  options?: { index?: number; side?: 'left' | 'right'; idGenerator?: MindmapIdGenerator }
): MindmapCommandResult<{ nodeId: MindmapNodeId }> => {
  if (!ensureNode(tree, parentId)) {
    return createFailure(`Parent node ${parentId} not found.`)
  }
  const createNodeId = options?.idGenerator?.nodeId ?? getDefaultNodeId
  const nodeId = createNodeId()
  if (tree.nodes[nodeId]) {
    return createFailure(`Node ${nodeId} already exists.`)
  }
  const draft = cloneTree(tree)
  const parent = draft.nodes[parentId]
  const node: MindmapNode = {
    id: nodeId,
    parentId: parentId,
    data: payload
  }
  if (parentId === draft.rootId) {
    node.side = options?.side ?? 'right'
  }
  draft.nodes[nodeId] = node
  ensureChildren(draft, nodeId)
  const children = ensureChildren(draft, parentId)
  const index = options?.index
  if (index === undefined || index < 0 || index > children.length) {
    children.push(nodeId)
  } else {
    children.splice(index, 0, nodeId)
  }
  updateMeta(draft)
  return ok({ tree: draft, nodeId })
}

export const addSibling = (
  tree: MindmapTree,
  nodeId: MindmapNodeId,
  position: 'before' | 'after',
  payload?: MindmapNodeData | MindmapInsertPayload,
  options?: { idGenerator?: MindmapIdGenerator }
): MindmapCommandResult<{ nodeId: MindmapNodeId }> => {
  const node = ensureNode(tree, nodeId)
  if (!node) return createFailure(`Node ${nodeId} not found.`)
  if (!node.parentId) return createFailure('Root node has no siblings.')
  const parentId = node.parentId
  const children = tree.children[parentId] ?? []
  const index = children.indexOf(nodeId)
  if (index < 0) return createFailure(`Node ${nodeId} not found in parent children.`)
  const insertIndex = position === 'before' ? index : index + 1
  const side = parentId === tree.rootId ? node.side : undefined
  return addChild(tree, parentId, payload, { index: insertIndex, side, idGenerator: options?.idGenerator })
}

export const insertParent = (
  tree: MindmapTree,
  nodeId: MindmapNodeId,
  payload?: MindmapNodeData | MindmapInsertPayload,
  options?: { side?: 'left' | 'right'; idGenerator?: MindmapIdGenerator }
): MindmapCommandResult<{ nodeId: MindmapNodeId }> => {
  if (nodeId === tree.rootId) return createFailure('Root node cannot be wrapped.')
  const node = ensureNode(tree, nodeId)
  if (!node) return createFailure(`Node ${nodeId} not found.`)
  const parentId = node.parentId
  if (!parentId) return createFailure('Node parent missing.')

  const children = tree.children[parentId] ?? []
  const index = children.indexOf(nodeId)
  if (index < 0) return createFailure(`Node ${nodeId} not found in parent children.`)

  const createNodeId = options?.idGenerator?.nodeId ?? getDefaultNodeId
  const insertedNodeId = createNodeId()
  if (tree.nodes[insertedNodeId]) {
    return createFailure(`Node ${insertedNodeId} already exists.`)
  }

  const draft = cloneTree(tree)
  const nextParent: MindmapNode = {
    id: insertedNodeId,
    parentId,
    data: payload
  }
  if (parentId === draft.rootId) {
    nextParent.side = options?.side ?? node.side ?? 'right'
  }

  draft.nodes[insertedNodeId] = nextParent
  draft.children[insertedNodeId] = [nodeId]
  ensureChildren(draft, parentId)[index] = insertedNodeId

  const nextNode = {
    ...draft.nodes[nodeId],
    parentId: insertedNodeId
  }
  if (nextNode.side) {
    delete nextNode.side
  }
  draft.nodes[nodeId] = nextNode

  updateMeta(draft)
  return ok({ tree: draft, nodeId: insertedNodeId })
}

export const insertNode = (
  tree: MindmapTree,
  input: MindmapInsertInput,
  options?: { idGenerator?: MindmapIdGenerator }
): MindmapCommandResult<{ nodeId: MindmapNodeId }> => {
  switch (input.kind) {
    case 'child':
      return addChild(tree, input.parentId, input.payload, {
        index: input.options?.index,
        side: input.options?.side,
        idGenerator: options?.idGenerator
      })
    case 'sibling':
      return addSibling(
        tree,
        input.nodeId,
        input.position,
        input.payload,
        {
          idGenerator: options?.idGenerator
        }
      )
    case 'parent':
      return insertParent(tree, input.nodeId, input.payload, {
        side: input.options?.side,
        idGenerator: options?.idGenerator
      })
    default:
      return createFailure('Unsupported insert input.')
  }
}

export const moveSubtree = (
  tree: MindmapTree,
  input: MindmapMoveSubtreeInput
): MindmapCommandResult => {
  const {
    nodeId,
    parentId: newParentId,
    index,
    side
  } = input
  if (nodeId === tree.rootId) return createFailure('Root node cannot be moved.')
  const node = ensureNode(tree, nodeId)
  if (!node) return createFailure(`Node ${nodeId} not found.`)
  if (!ensureNode(tree, newParentId)) return createFailure(`Parent node ${newParentId} not found.`)
  if (isAncestorOf(tree, nodeId, newParentId)) return createFailure('Cannot move node into its own subtree.')

  const draft = cloneTree(tree)
  const prevParentId = node.parentId
  if (!prevParentId) return createFailure('Node parent missing.')
  const prevChildren = draft.children[prevParentId] ?? []
  const prevIndex = prevChildren.indexOf(nodeId)
  if (prevIndex >= 0) {
    prevChildren.splice(prevIndex, 1)
  }

  const nextChildren = ensureChildren(draft, newParentId)
  const insertIndex = normalizeMoveIndex({
    prevParentId,
    nextParentId: newParentId,
    prevIndex,
    requestedIndex: index
  })
  if (insertIndex === undefined || insertIndex < 0 || insertIndex > nextChildren.length) {
    nextChildren.push(nodeId)
  } else {
    nextChildren.splice(insertIndex, 0, nodeId)
  }

  const nextNode = { ...draft.nodes[nodeId], parentId: newParentId }
  if (newParentId === draft.rootId) {
    nextNode.side = side ?? nextNode.side ?? 'right'
  } else if (nextNode.side) {
    delete nextNode.side
  }
  draft.nodes[nodeId] = nextNode
  updateMeta(draft)
  return ok({ tree: draft })
}

export const removeSubtree = (
  tree: MindmapTree,
  input: MindmapRemoveSubtreeInput
): MindmapCommandResult => {
  const { nodeId } = input
  if (nodeId === tree.rootId) return createFailure('Root node cannot be removed.')
  const node = ensureNode(tree, nodeId)
  if (!node) return createFailure(`Node ${nodeId} not found.`)
  const draft = cloneTree(tree)
  const parentId = node.parentId
  if (parentId) {
    const siblings = draft.children[parentId] ?? []
    const index = siblings.indexOf(nodeId)
    if (index >= 0) siblings.splice(index, 1)
  }
  const subtreeIds = collectSubtreeIds(tree, nodeId)
  subtreeIds.forEach((id) => {
    delete draft.nodes[id]
    delete draft.children[id]
  })
  updateMeta(draft)
  return ok({ tree: draft })
}

export const cloneSubtree = (
  tree: MindmapTree,
  input: MindmapCloneSubtreeInput,
  options?: { idGenerator?: MindmapIdGenerator }
): MindmapCommandResult<{ nodeId: MindmapNodeId; map: Record<MindmapNodeId, MindmapNodeId> }> => {
  const {
    nodeId,
    parentId: explicitParentId,
    index,
    side
  } = input
  const node = ensureNode(tree, nodeId)
  if (!node) return createFailure(`Node ${nodeId} not found.`)
  const parentId = explicitParentId ?? node.parentId
  if (!parentId) return createFailure('Root clone requires explicit parentId.')
  if (!ensureNode(tree, parentId)) return createFailure(`Parent node ${parentId} not found.`)
  if (isAncestorOf(tree, nodeId, parentId)) return createFailure('Cannot clone into its own subtree.')

  const createNodeId = options?.idGenerator?.nodeId ?? getDefaultNodeId
  const subtreeIds = collectSubtreeIds(tree, nodeId)
  const idMap: Record<MindmapNodeId, MindmapNodeId> = {}
  subtreeIds.forEach((id) => {
    idMap[id] = createNodeId()
  })

  const draft = cloneTree(tree)
  subtreeIds.forEach((id) => {
    const source = tree.nodes[id]
    const nextId = idMap[id]
    const nextParentId = source.parentId ? idMap[source.parentId] : undefined
    const nextNode: MindmapNode = {
      ...source,
      id: nextId,
      parentId: id === nodeId ? parentId : nextParentId
    }
    if (id === nodeId && parentId === draft.rootId) {
      nextNode.side = side ?? source.side ?? 'right'
    } else if (nextNode.side && parentId !== draft.rootId) {
      delete nextNode.side
    }
    draft.nodes[nextId] = nextNode
  })

  subtreeIds.forEach((id) => {
    const sourceChildren = tree.children[id] ?? []
    const nextId = idMap[id]
    draft.children[nextId] = sourceChildren.map((childId) => idMap[childId])
  })

  const insertTarget = ensureChildren(draft, parentId)
  const rootCloneId = idMap[nodeId]
  const insertIndex = index
  if (insertIndex === undefined || insertIndex < 0 || insertIndex > insertTarget.length) {
    insertTarget.push(rootCloneId)
  } else {
    insertTarget.splice(insertIndex, 0, rootCloneId)
  }

  updateMeta(draft)
  return ok({ tree: draft, nodeId: rootCloneId, map: idMap })
}

export const updateNode = (
  tree: MindmapTree,
  input: MindmapUpdateNodeInput
): MindmapCommandResult => {
  const {
    nodeId,
    update
  } = input
  const node = ensureNode(tree, nodeId)
  if (!node) return createFailure(`Node ${nodeId} not found.`)

  const hasRecords = Boolean(update.records?.length)
  const hasCollapsed = typeof update.collapsed === 'boolean'
  const hasSide = typeof update.side !== 'undefined'
  if (!hasRecords && !hasCollapsed && !hasSide) {
    return createFailure('No node updates provided.')
  }

  const draft = cloneTree(tree)
  const nextNode: MindmapNode = {
    ...draft.nodes[nodeId]
  }

  if (hasRecords) {
    let nextData = nextNode.data

    for (const record of update.records ?? []) {
      const result = applyDataMutation(nextData, record)
      if (!result.ok) {
        return createFailure(result.message)
      }
      nextData = result.value as MindmapNode['data']
    }

    nextNode.data = nextData
  }

  if (hasCollapsed) {
    nextNode.collapsed = update.collapsed
  }

  if (hasSide) {
    if (node.parentId !== tree.rootId) {
      return createFailure('Only root-level children can have side.')
    }
    nextNode.side = update.side
  }

  draft.nodes[nodeId] = nextNode
  updateMeta(draft)
  return ok({ tree: draft })
}

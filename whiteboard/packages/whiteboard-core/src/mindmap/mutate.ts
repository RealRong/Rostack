import { createId } from '@whiteboard/core/id'
import { err, ok } from '@whiteboard/core/result'
import {
  createBlankMindmapTemplate,
  instantiateMindmapTemplate
} from '@whiteboard/core/mindmap/template'
import type {
  MindmapBranchStyle,
  MindmapCommandResult,
  MindmapCloneSubtreeInput,
  MindmapCreateInput,
  MindmapIdGenerator,
  MindmapInsertInput,
  MindmapMoveSubtreeInput,
  MindmapNodeId,
  MindmapRemoveSubtreeInput,
  MindmapTree,
  MindmapTreePatch
} from '@whiteboard/core/mindmap/types'

type TreeDraft = MindmapTree

const DEFAULT_BRANCH: MindmapBranchStyle = {
  color: 'var(--ui-text-primary)',
  line: 'curve',
  width: 2,
  stroke: 'solid'
}

const createFailure = (message: string) => err('invalid', message)
const getDefaultNodeId = () => createId('mnode')

const cloneBranch = (
  branch: MindmapBranchStyle
): MindmapBranchStyle => ({
  ...branch
})

const cloneTree = (tree: MindmapTree): TreeDraft => ({
  ...tree,
  nodes: Object.fromEntries(
    Object.entries(tree.nodes).map(([id, node]) => [
      id,
      {
        ...node,
        branch: cloneBranch(node.branch)
      }
    ])
  ),
  children: Object.fromEntries(
    Object.entries(tree.children).map(([id, list]) => [id, [...list]])
  ),
  layout: {
    ...tree.layout
  },
  meta: tree.meta ? { ...tree.meta } : undefined
})

const ensureChildren = (
  tree: TreeDraft,
  id: MindmapNodeId
) => {
  if (!tree.children[id]) {
    tree.children[id] = []
  }
  return tree.children[id]
}

const ensureNode = (
  tree: MindmapTree,
  id: MindmapNodeId
) => tree.nodes[id]

const updateMeta = (tree: TreeDraft, timestamp = new Date().toISOString()) => {
  if (!tree.meta) {
    tree.meta = { createdAt: timestamp, updatedAt: timestamp }
  } else {
    if (!tree.meta.createdAt) tree.meta.createdAt = timestamp
    tree.meta.updatedAt = timestamp
  }
}

const collectSubtreeIds = (
  tree: MindmapTree,
  rootId: MindmapNodeId
) => {
  const result: MindmapNodeId[] = []
  const stack: MindmapNodeId[] = [rootId]
  const visited = new Set<MindmapNodeId>()
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    result.push(current)
    ;(tree.children[current] ?? []).forEach((childId) => stack.push(childId))
  }
  return result
}

const isAncestorOf = (
  tree: MindmapTree,
  ancestorId: MindmapNodeId,
  nodeId: MindmapNodeId
) => {
  let current = tree.nodes[nodeId]?.parentId
  while (current) {
    if (current === ancestorId) {
      return true
    }
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

const cloneTreeNode = (
  tree: MindmapTree,
  sourceId: MindmapNodeId,
  overrides: Partial<MindmapTree['nodes'][MindmapNodeId]> = {}
) => ({
  parentId: overrides.parentId ?? tree.nodes[sourceId]?.parentId,
  side: overrides.side ?? tree.nodes[sourceId]?.side,
  collapsed: overrides.collapsed ?? tree.nodes[sourceId]?.collapsed,
  branch: cloneBranch(overrides.branch ?? tree.nodes[sourceId]?.branch ?? DEFAULT_BRANCH)
})

const resolveInsertedBranch = (
  tree: MindmapTree,
  parentId: MindmapNodeId,
  side?: 'left' | 'right'
) => {
  const siblings = tree.children[parentId] ?? []
  const siblingId = side
    ? siblings.find((childId) => tree.nodes[childId]?.side === side)
    : siblings[0]
  return cloneBranch(
    (siblingId ? tree.nodes[siblingId]?.branch : undefined)
      ?? tree.nodes[parentId]?.branch
      ?? DEFAULT_BRANCH
  )
}

export const createMindmap = (
  input: Partial<MindmapCreateInput> = {},
  options?: {
    idGenerator?: MindmapIdGenerator
  }
): MindmapTree => instantiateMindmapTemplate({
  template: input.template ?? createBlankMindmapTemplate(),
  rootId: options?.idGenerator?.nodeId?.(),
  createNodeId: options?.idGenerator?.nodeId ?? getDefaultNodeId
}).tree

export const addChild = (
  tree: MindmapTree,
  parentId: MindmapNodeId,
  _payload?: unknown,
  options?: {
    index?: number
    side?: 'left' | 'right'
    idGenerator?: MindmapIdGenerator
  }
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
  draft.nodes[nodeId] = {
    parentId,
    side: parentId === draft.rootNodeId ? (options?.side ?? 'right') : undefined,
    branch: resolveInsertedBranch(draft, parentId, options?.side)
  }
  ensureChildren(draft, nodeId)
  const children = ensureChildren(draft, parentId)
  const index = options?.index
  if (index === undefined || index < 0 || index > children.length) {
    children.push(nodeId)
  } else {
    children.splice(index, 0, nodeId)
  }

  updateMeta(draft)
  return ok({
    tree: draft,
    nodeId
  })
}

export const insertNode = (
  tree: MindmapTree,
  input: MindmapInsertInput,
  options?: {
    idGenerator?: MindmapIdGenerator
  }
): MindmapCommandResult<{ nodeId: MindmapNodeId }> => {
  switch (input.kind) {
    case 'child':
      return addChild(tree, input.parentId, input.payload, {
        index: input.options?.index,
        side: input.options?.side,
        idGenerator: options?.idGenerator
      })
    case 'sibling': {
      const target = tree.nodes[input.nodeId]
      const parentId = target?.parentId
      if (!target || !parentId) {
        return createFailure(`Node ${input.nodeId} cannot create a sibling.`)
      }
      const siblings = tree.children[parentId] ?? []
      const currentIndex = siblings.indexOf(input.nodeId)
      const index = currentIndex < 0
        ? undefined
        : input.position === 'before'
          ? currentIndex
          : currentIndex + 1
      return addChild(tree, parentId, input.payload, {
        index,
        side: target.side,
        idGenerator: options?.idGenerator
      })
    }
    case 'parent': {
      if (input.nodeId === tree.rootNodeId) {
        return createFailure('Root node cannot be wrapped.')
      }
      const target = tree.nodes[input.nodeId]
      const parentId = target?.parentId
      if (!target || !parentId) {
        return createFailure(`Node ${input.nodeId} not found.`)
      }
      const createNodeId = options?.idGenerator?.nodeId ?? getDefaultNodeId
      const nodeId = createNodeId()
      if (tree.nodes[nodeId]) {
        return createFailure(`Node ${nodeId} already exists.`)
      }

      const draft = cloneTree(tree)
      const siblings = ensureChildren(draft, parentId)
      const siblingIndex = siblings.indexOf(input.nodeId)
      if (siblingIndex < 0) {
        return createFailure(`Node ${input.nodeId} is detached.`)
      }

      draft.nodes[nodeId] = {
        parentId,
        side: parentId === draft.rootNodeId
          ? (target.side ?? input.options?.side ?? 'right')
          : undefined,
        branch: resolveInsertedBranch(draft, parentId, target.side)
      }
      ensureChildren(draft, nodeId).push(input.nodeId)
      siblings.splice(siblingIndex, 1, nodeId)
      draft.nodes[input.nodeId] = {
        ...draft.nodes[input.nodeId]!,
        parentId: nodeId,
        side: undefined
      }
      updateMeta(draft)
      return ok({
        tree: draft,
        nodeId
      })
    }
    default:
      return createFailure('Unsupported insert mode.')
  }
}

export const moveSubtree = (
  tree: MindmapTree,
  input: MindmapMoveSubtreeInput
): MindmapCommandResult => {
  if (input.nodeId === tree.rootNodeId) {
    return createFailure('Root node cannot be moved as a subtree.')
  }
  const node = tree.nodes[input.nodeId]
  const nextParent = tree.nodes[input.parentId]
  if (!node || !nextParent) {
    return createFailure('Mindmap move target not found.')
  }
  if (isAncestorOf(tree, input.nodeId, input.parentId)) {
    return createFailure('A node cannot move into its own subtree.')
  }
  const prevParentId = node.parentId
  if (!prevParentId) {
    return createFailure('Mindmap node parent missing.')
  }

  const draft = cloneTree(tree)
  const prevChildren = ensureChildren(draft, prevParentId)
  const prevIndex = prevChildren.indexOf(input.nodeId)
  if (prevIndex < 0) {
    return createFailure('Mindmap node is detached.')
  }
  prevChildren.splice(prevIndex, 1)

  const nextChildren = ensureChildren(draft, input.parentId)
  const normalizedIndex = normalizeMoveIndex({
    prevParentId,
    nextParentId: input.parentId,
    prevIndex,
    requestedIndex: input.index
  })
  if (
    normalizedIndex === undefined
    || normalizedIndex < 0
    || normalizedIndex > nextChildren.length
  ) {
    nextChildren.push(input.nodeId)
  } else {
    nextChildren.splice(normalizedIndex, 0, input.nodeId)
  }

  draft.nodes[input.nodeId] = {
    ...draft.nodes[input.nodeId]!,
    parentId: input.parentId,
    side: input.parentId === draft.rootNodeId
      ? (input.side ?? draft.nodes[input.nodeId]!.side ?? 'right')
      : undefined
  }

  updateMeta(draft)
  return ok({
    tree: draft
  })
}

export const removeSubtree = (
  tree: MindmapTree,
  input: MindmapRemoveSubtreeInput
): MindmapCommandResult<{ removedIds: MindmapNodeId[] }> => {
  if (input.nodeId === tree.rootNodeId) {
    return createFailure('Root node cannot be removed from the tree.')
  }
  const node = tree.nodes[input.nodeId]
  if (!node) {
    return createFailure(`Node ${input.nodeId} not found.`)
  }

  const draft = cloneTree(tree)
  const removedIds = collectSubtreeIds(draft, input.nodeId)
  const parentId = node.parentId!
  draft.children[parentId] = (draft.children[parentId] ?? [])
    .filter((childId) => childId !== input.nodeId)

  removedIds.forEach((id) => {
    delete draft.nodes[id]
    delete draft.children[id]
  })
  updateMeta(draft)
  return ok({
    tree: draft,
    removedIds
  })
}

export const cloneSubtree = (
  tree: MindmapTree,
  input: MindmapCloneSubtreeInput,
  options?: {
    idGenerator?: MindmapIdGenerator
  }
): MindmapCommandResult<{
  nodeId: MindmapNodeId
  map: Record<MindmapNodeId, MindmapNodeId>
}> => {
  const source = tree.nodes[input.nodeId]
  if (!source) {
    return createFailure(`Node ${input.nodeId} not found.`)
  }
  const parentId = input.parentId ?? source.parentId
  if (!parentId || !tree.nodes[parentId]) {
    return createFailure('Clone destination parent not found.')
  }

  const createNodeId = options?.idGenerator?.nodeId ?? getDefaultNodeId
  const sourceIds = collectSubtreeIds(tree, input.nodeId)
  const map: Record<MindmapNodeId, MindmapNodeId> = {}
  sourceIds.forEach((sourceId) => {
    let nextId = createNodeId()
    while (tree.nodes[nextId] || map[sourceIds.find((id) => map[id] === nextId) ?? '']) {
      nextId = createNodeId()
    }
    map[sourceId] = nextId
  })

  const draft = cloneTree(tree)
  sourceIds.forEach((sourceId) => {
    const targetId = map[sourceId]!
    const cloned = cloneTreeNode(draft, sourceId)
    const sourceParentId = sourceId === input.nodeId
      ? parentId
      : map[tree.nodes[sourceId]!.parentId!]
    draft.nodes[targetId] = {
      ...cloned,
      parentId: sourceParentId,
      side: sourceId === input.nodeId
        ? (parentId === draft.rootNodeId ? (input.side ?? source.side) : undefined)
        : cloned.side
    }
    draft.children[targetId] = []
  })

  sourceIds.forEach((sourceId) => {
    const targetId = map[sourceId]!
    const sourceChildren = tree.children[sourceId] ?? []
    draft.children[targetId] = sourceChildren.map((childId) => map[childId]!)
  })

  const children = ensureChildren(draft, parentId)
  const index = input.index
  if (index === undefined || index < 0 || index > children.length) {
    children.push(map[input.nodeId]!)
  } else {
    children.splice(index, 0, map[input.nodeId]!)
  }

  updateMeta(draft)
  return ok({
    tree: draft,
    nodeId: map[input.nodeId]!,
    map
  })
}

export const patchMindmap = (
  tree: MindmapTree,
  patch: MindmapTreePatch
): MindmapCommandResult => {
  const layoutPatch = patch.layout
  if (!layoutPatch) {
    return ok({
      tree
    })
  }

  const draft = cloneTree(tree)
  draft.layout = {
    ...draft.layout,
    ...layoutPatch
  }
  updateMeta(draft)
  return ok({
    tree: draft
  })
}

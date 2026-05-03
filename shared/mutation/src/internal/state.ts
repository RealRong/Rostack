import type {
  MutationSequenceAnchor,
  MutationTreeInsertInput,
  MutationTreeMoveInput,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot
} from '../schema/constants'
import type {
  MutationMapNode,
  MutationSequenceNode,
  MutationShape,
  MutationShapeNode,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from '../schema/node'
import {
  getNodeMeta,
  type MutationOwnerMeta
} from '../schema/meta'
import {
  getNodeAccess
} from '../schema/internals'

type AnyCollectionNode =
  | MutationSingletonNode<MutationShape>
  | MutationTableNode<string, MutationShape>
  | MutationMapNode<string, MutationShape>

export const readAtPath = (
  value: unknown,
  path: readonly string[]
): unknown => path.reduce<unknown>(
  (current, key) => (
    typeof current === 'object'
    && current !== null
  )
    ? (current as Record<string, unknown>)[key]
    : undefined,
  value
)

export const writeAtPath = <TValue,>(
  source: TValue,
  path: readonly string[],
  nextValue: unknown
): TValue => {
  if (path.length === 0) {
    return nextValue as TValue
  }

  const [head, ...tail] = path
  const record = (
    typeof source === 'object'
    && source !== null
    && !Array.isArray(source)
  )
    ? source as Record<string, unknown>
    : {}

  return {
    ...record,
    [head]: writeAtPath(record[head], tail, nextValue)
  } as TValue
}

export const updateAtPath = <TValue,>(
  source: TValue,
  path: readonly string[],
  update: (current: unknown) => unknown
): TValue => writeAtPath(
  source,
  path,
  update(readAtPath(source, path))
)

const readFamilyValue = (
  node: AnyCollectionNode,
  document: unknown
): unknown => getNodeAccess(node)
  ? getNodeAccess(node)!.read(document)
  : readAtPath(document, getNodeMeta(node).path)

const writeFamilyValue = (
  node: AnyCollectionNode,
  document: unknown,
  nextValue: unknown
): unknown => getNodeAccess(node)
  ? getNodeAccess(node)!.write(document, nextValue as never)
  : writeAtPath(document, getNodeMeta(node).path, nextValue)

export const readOwnerValue = (
  owner: MutationOwnerMeta,
  document: unknown,
  targetId?: string
): unknown => {
  switch (owner.kind) {
    case 'document':
      return document
    case 'singleton':
      return readFamilyValue(owner.node, document)
    case 'table': {
      const table = readFamilyValue(owner.node, document) as {
        byId?: Record<string, unknown>
      } | undefined
      return targetId
        ? table?.byId?.[targetId]
        : undefined
    }
    case 'map': {
      const value = readFamilyValue(owner.node, document) as Record<string, unknown> | undefined
      return targetId
        ? value?.[targetId]
        : undefined
    }
  }
}

export const writeOwnerValue = (
  owner: MutationOwnerMeta,
  document: unknown,
  targetId: string | undefined,
  nextValue: unknown
): unknown => {
  switch (owner.kind) {
    case 'document':
      return nextValue
    case 'singleton':
      return writeFamilyValue(owner.node, document, nextValue)
    case 'table': {
      if (!targetId) {
        throw new Error('Mutation write is missing a table target id.')
      }
      const table = readFamilyValue(owner.node, document) as {
        ids?: readonly string[]
        byId?: Record<string, unknown>
      } | undefined
      const ids = table?.ids ?? []
      return writeFamilyValue(owner.node, document, {
        ids,
        byId: {
          ...(table?.byId ?? {}),
          [targetId]: nextValue
        }
      })
    }
    case 'map': {
      if (!targetId) {
        throw new Error('Mutation write is missing a map target id.')
      }
      const value = readFamilyValue(owner.node, document) as Record<string, unknown> | undefined
      return writeFamilyValue(owner.node, document, {
        ...(value ?? {}),
        [targetId]: nextValue
      })
    }
  }
}

export const readNodeValue = (
  node: MutationShapeNode,
  document: unknown,
  targetId?: string
): unknown => {
  if (
    node.kind === 'singleton'
    || node.kind === 'table'
    || node.kind === 'map'
  ) {
    return readFamilyValue(node, document)
  }

  if (
    (node.kind === 'sequence' || node.kind === 'tree')
    && getNodeAccess(node)
  ) {
    return getNodeAccess(node)!.read(document, targetId)
  }

  const meta = getNodeMeta(node)
  const ownerValue = readOwnerValue(meta.owner, document, targetId)
  return readAtPath(ownerValue, meta.relativePath)
}

export const writeNodeValue = (
  node: MutationShapeNode,
  document: unknown,
  nextValue: unknown,
  targetId?: string
): unknown => {
  if (
    node.kind === 'singleton'
    || node.kind === 'table'
    || node.kind === 'map'
  ) {
    return writeFamilyValue(node, document, nextValue)
  }

  if (
    (node.kind === 'sequence' || node.kind === 'tree')
    && getNodeAccess(node)
  ) {
    return getNodeAccess(node)!.write(document, nextValue as never, targetId)
  }

  const meta = getNodeMeta(node)
  const ownerValue = readOwnerValue(meta.owner, document, targetId)
  const nextOwnerValue = writeAtPath(ownerValue, meta.relativePath, nextValue)
  return writeOwnerValue(meta.owner, document, targetId, nextOwnerValue)
}

export const replaceSequence = <TItem,>(
  items: readonly TItem[],
  nextItems: readonly TItem[]
): readonly TItem[] => (
  items === nextItems
    ? items
    : [...nextItems]
)

const insertIndexForAnchor = (
  items: readonly string[],
  anchor?: MutationSequenceAnchor
): number => {
  if (!anchor || ('at' in anchor && anchor.at === 'end')) {
    return items.length
  }
  if ('at' in anchor && anchor.at === 'start') {
    return 0
  }
  if ('before' in anchor) {
    const index = items.indexOf(anchor.before)
    return index < 0
      ? items.length
      : index
  }

  if ('after' in anchor) {
    const index = items.indexOf(anchor.after)
    return index < 0
      ? items.length
      : index + 1
  }

  return items.length
}

export const insertSequenceItem = <TItem extends string>(
  items: readonly TItem[],
  item: TItem,
  anchor?: MutationSequenceAnchor
): readonly TItem[] => {
  const next = items.filter((entry) => entry !== item)
  const index = insertIndexForAnchor(next, anchor)
  return [
    ...next.slice(0, index),
    item,
    ...next.slice(index)
  ]
}

export const moveSequenceItem = <TItem extends string>(
  items: readonly TItem[],
  item: TItem,
  anchor?: MutationSequenceAnchor
): readonly TItem[] => insertSequenceItem(items, item, anchor)

export const removeSequenceItem = <TItem extends string>(
  items: readonly TItem[],
  item: TItem
): readonly TItem[] => items.filter((entry) => entry !== item)

const cloneTreeNodes = <TValue,>(
  nodes: Readonly<Record<string, MutationTreeNodeSnapshot<TValue>>>
): Record<string, MutationTreeNodeSnapshot<TValue>> => Object.fromEntries(
  Object.entries(nodes).map(([nodeId, node]) => [
    nodeId,
    {
      ...node,
      children: [...node.children]
    }
  ])
)

const detachTreeNode = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string
): MutationTreeSnapshot<TValue> => {
  const nodes = cloneTreeNodes(tree.nodes)
  const current = nodes[nodeId]
  if (!current) {
    return tree
  }

  const rootIds = [...tree.rootIds]
  if (current.parentId) {
    const parent = nodes[current.parentId]
    if (parent) {
      parent.children = parent.children.filter((childId) => childId !== nodeId)
    }
  } else {
    const index = rootIds.indexOf(nodeId)
    if (index >= 0) {
      rootIds.splice(index, 1)
    }
  }

  return {
    rootIds,
    nodes
  }
}

const attachTreeNode = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string,
  parentId: string | undefined,
  index: number | undefined
): MutationTreeSnapshot<TValue> => {
  const nodes = cloneTreeNodes(tree.nodes)
  const rootIds = [...tree.rootIds]
  const nextIndex = Math.max(0, index ?? Number.MAX_SAFE_INTEGER)

  if (parentId) {
    const parent = nodes[parentId]
    if (!parent) {
      throw new Error(`Mutation tree parent "${parentId}" does not exist.`)
    }
    const children = [...parent.children]
    const insertAt = Math.min(nextIndex, children.length)
    children.splice(insertAt, 0, nodeId)
    parent.children = children
    const current = nodes[nodeId]
    if (current) {
      current.parentId = parentId
    }
    return {
      rootIds,
      nodes
    }
  }

  const insertAt = Math.min(nextIndex, rootIds.length)
  rootIds.splice(insertAt, 0, nodeId)
  const current = nodes[nodeId]
  if (current) {
    delete current.parentId
  }
  return {
    rootIds,
    nodes
  }
}

export const insertTreeNode = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string,
  input: MutationTreeInsertInput<TValue>
): MutationTreeSnapshot<TValue> => {
  const nodes = cloneTreeNodes(tree.nodes)
  if (nodes[nodeId]) {
    throw new Error(`Mutation tree node "${nodeId}" already exists.`)
  }

  nodes[nodeId] = {
    parentId: input.parentId,
    children: [],
    ...(input.value === undefined ? {} : { value: input.value })
  }

  return attachTreeNode({
    rootIds: [...tree.rootIds],
    nodes
  }, nodeId, input.parentId, input.index)
}

export const moveTreeNode = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string,
  input: MutationTreeMoveInput
): MutationTreeSnapshot<TValue> => {
  if (!tree.nodes[nodeId]) {
    return tree
  }

  return attachTreeNode(
    detachTreeNode(tree, nodeId),
    nodeId,
    input.parentId,
    input.index
  )
}

const subtreeNodeIds = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string
): readonly string[] => {
  const result: string[] = []
  const visit = (currentId: string) => {
    const current = tree.nodes[currentId]
    if (!current) {
      return
    }
    result.push(currentId)
    current.children.forEach(visit)
  }
  visit(nodeId)
  return result
}

export const removeTreeNode = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string
): MutationTreeSnapshot<TValue> => {
  if (!tree.nodes[nodeId]) {
    return tree
  }

  const detached = detachTreeNode(tree, nodeId)
  const nodes = cloneTreeNodes(detached.nodes)
  subtreeNodeIds(detached, nodeId).forEach((currentId) => {
    delete nodes[currentId]
  })

  return {
    rootIds: [...detached.rootIds],
    nodes
  }
}

export const patchTreeNodeValue = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string,
  patch: Record<string, unknown>
): MutationTreeSnapshot<TValue> => {
  const current = tree.nodes[nodeId]
  if (!current) {
    return tree
  }

  const nodes = cloneTreeNodes(tree.nodes)
  const node = nodes[nodeId]!
  const currentValue = (
    typeof node.value === 'object'
    && node.value !== null
  )
    ? node.value as Record<string, unknown>
    : {}
  node.value = {
    ...currentValue,
    ...patch
  } as TValue

  return {
    rootIds: [...tree.rootIds],
    nodes
  }
}

export const readSequenceItems = <TItem,>(
  node: MutationSequenceNode<TItem>,
  document: unknown,
  targetId?: string
): readonly TItem[] => (readNodeValue(node, document, targetId) as readonly TItem[] | undefined) ?? []

export const readTreeValue = <TNodeId extends string, TValue,>(
  node: MutationTreeNode<TNodeId, TValue>,
  document: unknown,
  targetId?: string
): MutationTreeSnapshot<TValue> => (readNodeValue(node, document, targetId) as MutationTreeSnapshot<TValue> | undefined) ?? {
  rootIds: [],
  nodes: {}
}

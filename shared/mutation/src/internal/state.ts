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

const TARGET_ID_SCOPE_SEPARATOR = '\u001f'

const splitTargetId = (
  targetId?: string
): readonly string[] => targetId === undefined
  ? []
  : targetId.split(TARGET_ID_SCOPE_SEPARATOR)

export const scopeTargetId = (
  ownerTargetId: string | undefined,
  targetId: string
): string => ownerTargetId === undefined
  ? targetId
  : `${ownerTargetId}${TARGET_ID_SCOPE_SEPARATOR}${targetId}`

export const readCurrentTargetId = (
  targetId?: string
): string | undefined => {
  const parts = splitTargetId(targetId)
  return parts.length
    ? parts[parts.length - 1]
    : undefined
}

export const readOwnerTargetId = (
  targetId?: string
): string | undefined => {
  const parts = splitTargetId(targetId)
  if (parts.length <= 1) {
    return undefined
  }
  return parts.slice(0, -1).join(TARGET_ID_SCOPE_SEPARATOR)
}

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
  document: unknown,
  targetId?: string
): unknown => {
  const access = getNodeAccess(node)
  if (access) {
    return access.read(document, targetId)
  }

  const meta = getNodeMeta(node)
  if (meta.owner.kind === 'document') {
    return readAtPath(document, meta.path)
  }

  const ownerValue = readOwnerValue(meta.owner, document, targetId)
  return readAtPath(ownerValue, meta.relativePath)
}

const writeFamilyValue = (
  node: AnyCollectionNode,
  document: unknown,
  nextValue: unknown,
  targetId?: string
): unknown => {
  const access = getNodeAccess(node)
  if (access) {
    return access.write(document, nextValue as never, targetId)
  }

  const meta = getNodeMeta(node)
  if (meta.owner.kind === 'document') {
    return writeAtPath(document, meta.path, nextValue)
  }

  const ownerValue = readOwnerValue(meta.owner, document, targetId)
  const nextOwnerValue = writeAtPath(ownerValue, meta.relativePath, nextValue)
  return writeOwnerValue(meta.owner, document, targetId, nextOwnerValue)
}

export const readOwnerValue = (
  owner: MutationOwnerMeta,
  document: unknown,
  targetId?: string
): unknown => {
  switch (owner.kind) {
    case 'document':
      return document
    case 'singleton':
      return readFamilyValue(owner.node, document, readOwnerTargetId(targetId))
    case 'table': {
      const table = readFamilyValue(owner.node, document, readOwnerTargetId(targetId)) as {
        byId?: Record<string, unknown>
      } | undefined
      const currentTargetId = readCurrentTargetId(targetId)
      return currentTargetId
        ? table?.byId?.[currentTargetId]
        : undefined
    }
    case 'map': {
      const value = readFamilyValue(owner.node, document, readOwnerTargetId(targetId)) as Record<string, unknown> | undefined
      const currentTargetId = readCurrentTargetId(targetId)
      return currentTargetId
        ? value?.[currentTargetId]
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
      return writeFamilyValue(owner.node, document, nextValue, readOwnerTargetId(targetId))
    case 'table': {
      const currentTargetId = readCurrentTargetId(targetId)
      if (!currentTargetId) {
        throw new Error('Mutation write is missing a table target id.')
      }
      const table = readFamilyValue(owner.node, document, readOwnerTargetId(targetId)) as {
        ids?: readonly string[]
        byId?: Record<string, unknown>
      } | undefined
      const ids = table?.ids ?? []
      return writeFamilyValue(owner.node, document, {
        ids,
        byId: {
          ...(table?.byId ?? {}),
          [currentTargetId]: nextValue
        }
      }, readOwnerTargetId(targetId))
    }
    case 'map': {
      const currentTargetId = readCurrentTargetId(targetId)
      if (!currentTargetId) {
        throw new Error('Mutation write is missing a map target id.')
      }
      const value = readFamilyValue(owner.node, document, readOwnerTargetId(targetId)) as Record<string, unknown> | undefined
      return writeFamilyValue(owner.node, document, {
        ...(value ?? {}),
        [currentTargetId]: nextValue
      }, readOwnerTargetId(targetId))
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
    return readFamilyValue(node, document, targetId)
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
    return writeFamilyValue(node, document, nextValue, targetId)
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
  itemKeys: readonly string[],
  anchor?: MutationSequenceAnchor
): number => {
  if (!anchor || ('at' in anchor && anchor.at === 'end')) {
    return itemKeys.length
  }
  if ('at' in anchor && anchor.at === 'start') {
    return 0
  }
  if ('before' in anchor) {
    const index = itemKeys.indexOf(anchor.before)
    return index < 0
      ? itemKeys.length
      : index
  }

  if ('after' in anchor) {
    const index = itemKeys.indexOf(anchor.after)
    return index < 0
      ? itemKeys.length
      : index + 1
  }

  return itemKeys.length
}

export const insertSequenceItem = <TItem>(
  keyOf: (item: TItem) => string,
  items: readonly TItem[],
  item: TItem,
  anchor?: MutationSequenceAnchor
): readonly TItem[] => {
  const next = items.filter((entry) => keyOf(entry) !== keyOf(item))
  const index = insertIndexForAnchor(next.map((entry) => keyOf(entry)), anchor)
  return [
    ...next.slice(0, index),
    item,
    ...next.slice(index)
  ]
}

export const moveSequenceItem = <TItem>(
  keyOf: (item: TItem) => string,
  items: readonly TItem[],
  item: TItem,
  anchor?: MutationSequenceAnchor
): readonly TItem[] => insertSequenceItem(keyOf, items, item, anchor)

export const removeSequenceItem = <TItem>(
  keyOf: (item: TItem) => string,
  items: readonly TItem[],
  item: TItem
): readonly TItem[] => items.filter((entry) => keyOf(entry) !== keyOf(item))

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

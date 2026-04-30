import type {
  MutationApplyResult,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationOrderedSlot,
  MutationStructureSpec,
  MutationStructureTable,
  MutationStructuralCanonicalOperation,
  MutationStructuralFact,
  MutationStructuralOrderedDeleteOperation,
  MutationStructuralOrderedInsertOperation,
  MutationStructuralOrderedMoveOperation,
  MutationStructuralTreeDeleteOperation,
  MutationStructuralTreeInsertOperation,
  MutationStructuralTreeMoveOperation,
  MutationStructuralTreeRestoreOperation,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
} from './contracts'
import {
  cloneValue,
  EMPTY_DELTA,
  EMPTY_ISSUES,
  EMPTY_OUTPUTS,
  mutationFailure,
  sameJsonValue,
} from './contracts'

type StructuralDescriptor =
  | {
      kind: 'ordered'
      action: 'insert' | 'move' | 'delete'
    }
  | {
      kind: 'tree'
      action: 'insert' | 'move' | 'delete' | 'restore'
    }

const ROOT_PARENT_ID = '$root'

const cloneOrderedItem = <TItem,>(
  item: TItem,
  spec: {
    clone?(item: TItem): TItem
  }
): TItem => spec.clone
  ? spec.clone(item)
  : cloneValue(item)

const readRequiredStructure = (
  value: unknown
): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Structural mutation operation requires a non-empty structure.')
  }

  return value
}

const readRequiredItemId = (
  value: unknown
): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Structural ordered mutation operation requires a non-empty itemId.')
  }

  return value
}

const readRequiredNodeId = (
  value: unknown
): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Structural tree mutation operation requires a non-empty nodeId.')
  }

  return value
}

const readOptionalParentId = (
  value: unknown
): string | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Structural tree mutation operation parentId must be a non-empty string when provided.')
  }
  return value
}

const readOptionalIndex = (
  value: unknown
): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error('Structural mutation operation index must be a non-negative integer when provided.')
  }
  return value as number
}

const readRequiredOrderedAnchor = (
  value: unknown
): MutationOrderedAnchor => {
  if (!value || typeof value !== 'object' || !('kind' in value)) {
    throw new Error('Structural ordered mutation operation requires a valid anchor.')
  }

  const anchor = value as MutationOrderedAnchor
  switch (anchor.kind) {
    case 'start':
    case 'end':
      return anchor
    case 'before':
    case 'after':
      if (typeof anchor.itemId !== 'string' || anchor.itemId.length === 0) {
        throw new Error('Structural ordered anchor requires a non-empty itemId.')
      }
      return anchor
    default:
      throw new Error('Structural ordered mutation operation received an unknown anchor.')
  }
}

const readTreeSubtreeSnapshot = (
  value: unknown
): MutationTreeSubtreeSnapshot => {
  if (
    !value
    || typeof value !== 'object'
    || typeof (value as MutationTreeSubtreeSnapshot).rootId !== 'string'
    || !Number.isInteger((value as MutationTreeSubtreeSnapshot).index)
    || typeof (value as MutationTreeSubtreeSnapshot).nodes !== 'object'
    || (value as MutationTreeSubtreeSnapshot).nodes === null
  ) {
    throw new Error('Structural tree restore operation requires a valid subtree snapshot.')
  }

  return cloneValue(value as MutationTreeSubtreeSnapshot)
}

const readOrderedSlot = (
  items: readonly string[],
  itemId: string
): MutationOrderedSlot | undefined => {
  const index = items.indexOf(itemId)
  if (index < 0) {
    return undefined
  }

  return {
    prevId: items[index - 1],
    nextId: items[index + 1]
  }
}

const anchorFromSlot = (
  slot: MutationOrderedSlot | undefined
): MutationOrderedAnchor => {
  if (slot?.prevId) {
    return {
      kind: 'after',
      itemId: slot.prevId
    }
  }
  if (slot?.nextId) {
    return {
      kind: 'before',
      itemId: slot.nextId
    }
  }
  return {
    kind: 'start'
  }
}

const removeOrderedItem = <TItem,>(
  items: readonly TItem[],
  itemId: string,
  identify: (item: TItem) => string
): TItem[] => {
  const index = items.findIndex((item) => identify(item) === itemId)
  if (index < 0) {
    return [...items]
  }

  return [
    ...items.slice(0, index),
    ...items.slice(index + 1)
  ]
}

const insertOrderedItem = <TItem,>(
  items: readonly TItem[],
  item: TItem,
  anchor: MutationOrderedAnchor,
  identify: (item: TItem) => string
): TItem[] => {
  const itemId = identify(item)
  const filtered = removeOrderedItem(items, itemId, identify)

  if (anchor.kind === 'start') {
    return [item, ...filtered]
  }
  if (anchor.kind === 'end') {
    return [...filtered, item]
  }

  const anchorIndex = filtered.findIndex((entry) => identify(entry) === anchor.itemId)
  if (anchorIndex < 0) {
    return anchor.kind === 'before'
      ? [item, ...filtered]
      : [...filtered, item]
  }

  return anchor.kind === 'before'
    ? [...filtered.slice(0, anchorIndex), item, ...filtered.slice(anchorIndex)]
    : [...filtered.slice(0, anchorIndex + 1), item, ...filtered.slice(anchorIndex + 1)]
}

const cloneTreeNode = <TValue,>(
  node: MutationTreeNodeSnapshot<TValue>
): MutationTreeNodeSnapshot<TValue> => ({
  ...(node.parentId === undefined
    ? {}
    : {
        parentId: node.parentId
      }),
  children: [...node.children],
  ...(node.value === undefined
    ? {}
    : {
        value: cloneValue(node.value)
      })
})

const cloneTreeSnapshot = <TValue,>(
  tree: MutationTreeSnapshot<TValue>
): MutationTreeSnapshot<TValue> => ({
  rootIds: [...tree.rootIds],
  nodes: Object.fromEntries(
    Object.entries(tree.nodes).map(([nodeId, node]) => [
      nodeId,
      cloneTreeNode(node)
    ])
  )
})

const readParentChildren = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  parentId: string | undefined
): readonly string[] => parentId === undefined
  ? tree.rootIds
  : tree.nodes[parentId]?.children ?? []

const writeParentChildren = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  parentId: string | undefined,
  children: readonly string[]
): MutationTreeSnapshot<TValue> => {
  if (parentId === undefined) {
    return {
      ...tree,
      rootIds: [...children]
    }
  }

  const parent = tree.nodes[parentId]
  if (!parent) {
    throw new Error(`Structural tree parent "${parentId}" not found.`)
  }

  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [parentId]: {
        ...parent,
        children: [...children]
      }
    }
  }
}

const insertAtIndex = (
  items: readonly string[],
  value: string,
  index?: number
): string[] => {
  const filtered = items.filter((item) => item !== value)
  const insertIndex = index === undefined
    ? filtered.length
    : Math.max(0, Math.min(index, filtered.length))
  return [
    ...filtered.slice(0, insertIndex),
    value,
    ...filtered.slice(insertIndex)
  ]
}

const removeFromParent = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  parentId: string | undefined,
  nodeId: string
): MutationTreeSnapshot<TValue> => writeParentChildren(
  tree,
  parentId,
  readParentChildren(tree, parentId).filter((entry) => entry !== nodeId)
)

const readNodeIndex = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  parentId: string | undefined,
  nodeId: string
): number => readParentChildren(tree, parentId).indexOf(nodeId)

const collectSubtreeIds = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string
): readonly string[] => {
  const ids: string[] = []
  const visit = (currentId: string) => {
    ids.push(currentId)
    const current = tree.nodes[currentId]
    if (!current) {
      throw new Error(`Structural tree node "${currentId}" not found.`)
    }
    current.children.forEach((childId) => {
      visit(childId)
    })
  }

  visit(nodeId)
  return ids
}

const createTreeSubtreeSnapshot = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  nodeId: string
): MutationTreeSubtreeSnapshot<TValue> => {
  const node = tree.nodes[nodeId]
  if (!node) {
    throw new Error(`Structural tree node "${nodeId}" not found.`)
  }

  const subtreeIds = collectSubtreeIds(tree, nodeId)
  return {
    rootId: nodeId,
    parentId: node.parentId,
    index: readNodeIndex(tree, node.parentId, nodeId),
    nodes: Object.fromEntries(
      subtreeIds.map((entryId) => [
        entryId,
        cloneTreeNode(tree.nodes[entryId]!)
      ])
    )
  }
}

const isTreeAncestor = <TValue,>(
  tree: MutationTreeSnapshot<TValue>,
  candidateAncestorId: string,
  nodeId: string | undefined
): boolean => {
  let currentId = nodeId
  while (currentId) {
    if (currentId === candidateAncestorId) {
      return true
    }
    currentId = tree.nodes[currentId]?.parentId
  }

  return false
}

const orderedFootprint = (
  structure: string,
  itemId: string
): readonly MutationFootprint[] => [{
  kind: 'structure',
  structure
}, {
  kind: 'structure-item',
  structure,
  id: itemId
}]

const treeFootprint = (
  structure: string,
  nodeId: string,
  ...parentIds: readonly (string | undefined)[]
): readonly MutationFootprint[] => [
  {
    kind: 'structure-item',
    structure,
    id: nodeId
  },
  ...parentIds.map((parentId) => ({
    kind: 'structure-parent' as const,
    structure,
    id: parentId ?? ROOT_PARENT_ID
  }))
]

const structuralSuccess = <
  Doc,
  Op
>(input: {
  document: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  historyMode?: 'track' | 'skip' | 'neutral'
}): MutationApplyResult<Doc, Op> => ({
  ok: true,
  data: {
    document: input.document,
    forward: input.forward,
    inverse: input.inverse,
    delta: EMPTY_DELTA,
    structural: input.structural,
    footprint: input.footprint,
    outputs: EMPTY_OUTPUTS,
    issues: EMPTY_ISSUES,
    historyMode: input.historyMode ?? 'track'
  }
})

export const readStructuralOperation = (
  type: string
): StructuralDescriptor | undefined => {
  switch (type) {
    case 'structural.ordered.insert':
      return {
        kind: 'ordered',
        action: 'insert'
      }
    case 'structural.ordered.move':
      return {
        kind: 'ordered',
        action: 'move'
      }
    case 'structural.ordered.delete':
      return {
        kind: 'ordered',
        action: 'delete'
      }
    case 'structural.tree.insert':
      return {
        kind: 'tree',
        action: 'insert'
      }
    case 'structural.tree.move':
      return {
        kind: 'tree',
        action: 'move'
      }
    case 'structural.tree.delete':
      return {
        kind: 'tree',
        action: 'delete'
      }
    case 'structural.tree.restore':
      return {
        kind: 'tree',
        action: 'restore'
      }
    default:
      return undefined
  }
}

export const createStructuralOrderedInsertOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralOrderedInsertOperation, 'type'>
): Op => ({
  type: 'structural.ordered.insert',
  ...input
}) as unknown as Op

export const createStructuralOrderedMoveOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralOrderedMoveOperation, 'type'>
): Op => ({
  type: 'structural.ordered.move',
  ...input
}) as unknown as Op

export const createStructuralOrderedDeleteOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralOrderedDeleteOperation, 'type'>
): Op => ({
  type: 'structural.ordered.delete',
  ...input
}) as unknown as Op

export const createStructuralTreeInsertOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralTreeInsertOperation, 'type'>
): Op => ({
  type: 'structural.tree.insert',
  ...input
}) as unknown as Op

export const createStructuralTreeMoveOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralTreeMoveOperation, 'type'>
): Op => ({
  type: 'structural.tree.move',
  ...input
}) as unknown as Op

export const createStructuralTreeDeleteOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralTreeDeleteOperation, 'type'>
): Op => ({
  type: 'structural.tree.delete',
  ...input
}) as unknown as Op

export const createStructuralTreeRestoreOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralTreeRestoreOperation, 'type'>
): Op => ({
  type: 'structural.tree.restore',
  ...input
}) as unknown as Op

const readOrderedOperationResult = <
  Doc extends object,
  Op extends {
    type: string
  }
>(input: {
  document: Doc
  operation: Op
  spec: Extract<MutationStructureSpec<Doc>, { kind: 'ordered' }>
  action: 'insert' | 'move' | 'delete'
}): MutationApplyResult<Doc, Op> => {
  const operation = input.operation as unknown as MutationStructuralOrderedInsertOperation | MutationStructuralOrderedMoveOperation | MutationStructuralOrderedDeleteOperation
  const structure = readRequiredStructure(operation.structure)
  const itemId = readRequiredItemId(operation.itemId)
  const items = input.spec.read(input.document)
  const identify = input.spec.identify
  const itemIds = items.map((item) => identify(item))
  const currentIndex = itemIds.indexOf(itemId)

  if (input.action === 'insert') {
    const insertOperation = operation as MutationStructuralOrderedInsertOperation
    if (currentIndex >= 0) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural ordered insert found an existing item "${itemId}" in "${structure}".`
      )
    }

    const nextValue = cloneOrderedItem(insertOperation.value, input.spec)
    if (identify(nextValue) !== itemId) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural ordered insert value id does not match itemId "${itemId}".`
      )
    }

    const anchor = readRequiredOrderedAnchor(insertOperation.to)
    const nextItems = insertOrderedItem(items, nextValue, anchor, identify)
    return structuralSuccess({
      document: input.spec.write(input.document, nextItems),
      forward: [input.operation],
      inverse: [createStructuralOrderedDeleteOperation<Op>({
        structure,
        itemId
      })],
      structural: [{
        kind: 'ordered',
        action: 'insert',
        structure,
        itemId,
        to: anchor
      }],
      footprint: orderedFootprint(structure, itemId)
    })
  }

  if (currentIndex < 0) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation',
      `Structural ordered operation cannot find item "${itemId}" in "${structure}".`
    )
  }

  const currentSlot = readOrderedSlot(itemIds, itemId)

  if (input.action === 'delete') {
    const value = cloneOrderedItem(items[currentIndex]!, input.spec)
    const nextItems = removeOrderedItem(items, itemId, identify)
    return structuralSuccess({
      document: input.spec.write(input.document, nextItems),
      forward: [input.operation],
      inverse: [createStructuralOrderedInsertOperation<Op>({
        structure,
        itemId,
        value,
        to: anchorFromSlot(currentSlot)
      })],
      structural: [{
        kind: 'ordered',
        action: 'delete',
        structure,
        itemId,
        from: currentSlot
      }],
      footprint: orderedFootprint(structure, itemId)
    })
  }

  const moveOperation = operation as MutationStructuralOrderedMoveOperation
  const anchor = readRequiredOrderedAnchor(moveOperation.to)
  const nextItems = insertOrderedItem(
    items,
    items[currentIndex]!,
    anchor,
    identify
  )
  if (sameJsonValue(nextItems, items)) {
    return structuralSuccess({
      document: input.document,
      forward: [input.operation],
      inverse: [],
      structural: [],
      footprint: [],
      historyMode: 'neutral'
    })
  }

  return structuralSuccess({
    document: input.spec.write(input.document, nextItems),
    forward: [input.operation],
    inverse: [createStructuralOrderedMoveOperation<Op>({
      structure,
      itemId,
      to: anchorFromSlot(currentSlot)
    })],
    structural: [{
      kind: 'ordered',
      action: 'move',
      structure,
      itemId,
      from: currentSlot,
      to: anchor
    }],
    footprint: orderedFootprint(structure, itemId)
  })
}

const readTreeOperationResult = <
  Doc extends object,
  Op extends {
    type: string
  }
>(input: {
  document: Doc
  operation: Op
  spec: Extract<MutationStructureSpec<Doc>, { kind: 'tree' }>
  action: 'insert' | 'move' | 'delete' | 'restore'
}): MutationApplyResult<Doc, Op> => {
  const structure = readRequiredStructure(
    (input.operation as unknown as MutationStructuralCanonicalOperation).structure
  )
  const currentTree = cloneTreeSnapshot(input.spec.read(input.document))

  if (input.action === 'insert') {
    const operation = input.operation as unknown as MutationStructuralTreeInsertOperation
    const nodeId = readRequiredNodeId(operation.nodeId)
    const parentId = readOptionalParentId(operation.parentId)
    const index = readOptionalIndex(operation.index)
    if (currentTree.nodes[nodeId]) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural tree insert found an existing node "${nodeId}" in "${structure}".`
      )
    }
    if (parentId && !currentTree.nodes[parentId]) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural tree insert cannot find parent "${parentId}" in "${structure}".`
      )
    }

    const nextTree: MutationTreeSnapshot = {
      ...currentTree,
      nodes: {
        ...currentTree.nodes,
        [nodeId]: {
          ...(parentId === undefined
            ? {}
            : {
                parentId
              }),
          children: [],
          ...(operation.value === undefined
            ? {}
            : {
                value: input.spec.clone
                  ? input.spec.clone(operation.value)
                  : cloneValue(operation.value)
              })
        }
      }
    }
    const nextChildren = insertAtIndex(
      readParentChildren(nextTree, parentId),
      nodeId,
      index
    )
    const writtenTree = writeParentChildren(nextTree, parentId, nextChildren)
    const nextIndex = readNodeIndex(writtenTree, parentId, nodeId)
    return structuralSuccess({
      document: input.spec.write(input.document, writtenTree),
      forward: [input.operation],
      inverse: [createStructuralTreeDeleteOperation<Op>({
        structure,
        nodeId
      })],
      structural: [{
        kind: 'tree',
        action: 'insert',
        structure,
        nodeId,
        parentId,
        index: nextIndex
      }],
      footprint: treeFootprint(structure, nodeId, parentId)
    })
  }

  if (input.action === 'restore') {
    const operation = input.operation as unknown as MutationStructuralTreeRestoreOperation
    const snapshot = readTreeSubtreeSnapshot(operation.snapshot)
    if (currentTree.nodes[snapshot.rootId]) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural tree restore found an existing node "${snapshot.rootId}" in "${structure}".`
      )
    }
    if (snapshot.parentId && !currentTree.nodes[snapshot.parentId]) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural tree restore cannot find parent "${snapshot.parentId}" in "${structure}".`
      )
    }

    const nextTree: MutationTreeSnapshot = {
      ...currentTree,
      nodes: {
        ...currentTree.nodes,
        ...Object.fromEntries(
          Object.entries(snapshot.nodes).map(([nodeId, node]) => [
            nodeId,
            cloneTreeNode(node)
          ])
        )
      }
    }
    const nextChildren = insertAtIndex(
      readParentChildren(nextTree, snapshot.parentId),
      snapshot.rootId,
      snapshot.index
    )
    const writtenTree = writeParentChildren(nextTree, snapshot.parentId, nextChildren)
    const nextIndex = readNodeIndex(writtenTree, snapshot.parentId, snapshot.rootId)
    return structuralSuccess({
      document: input.spec.write(input.document, writtenTree),
      forward: [input.operation],
      inverse: [createStructuralTreeDeleteOperation<Op>({
        structure,
        nodeId: snapshot.rootId
      })],
      structural: [{
        kind: 'tree',
        action: 'restore',
        structure,
        nodeId: snapshot.rootId,
        parentId: snapshot.parentId,
        index: nextIndex
      }],
      footprint: treeFootprint(structure, snapshot.rootId, snapshot.parentId)
    })
  }

  const operation = input.operation as unknown as MutationStructuralTreeMoveOperation | MutationStructuralTreeDeleteOperation
  const nodeId = readRequiredNodeId(operation.nodeId)
  const currentNode = currentTree.nodes[nodeId]
  if (!currentNode) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation',
      `Structural tree operation cannot find node "${nodeId}" in "${structure}".`
    )
  }

  if (input.action === 'delete') {
    const snapshot = createTreeSubtreeSnapshot(currentTree, nodeId)
    const subtreeIds = collectSubtreeIds(currentTree, nodeId)
    let nextTree = removeFromParent(currentTree, currentNode.parentId, nodeId)
    nextTree = {
      ...nextTree,
      nodes: Object.fromEntries(
        Object.entries(nextTree.nodes).filter(([entryId]) => !subtreeIds.includes(entryId))
      )
    }
    return structuralSuccess({
      document: input.spec.write(input.document, nextTree),
      forward: [input.operation],
      inverse: [createStructuralTreeRestoreOperation<Op>({
        structure,
        snapshot
      })],
      structural: [{
        kind: 'tree',
        action: 'delete',
        structure,
        nodeId,
        previousParentId: currentNode.parentId,
        previousIndex: snapshot.index
      }],
      footprint: treeFootprint(structure, nodeId, currentNode.parentId)
    })
  }

  const moveOperation = input.operation as unknown as MutationStructuralTreeMoveOperation
  const parentId = readOptionalParentId(moveOperation.parentId)
  const index = readOptionalIndex(moveOperation.index)
  if (parentId && !currentTree.nodes[parentId]) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation',
      `Structural tree move cannot find parent "${parentId}" in "${structure}".`
    )
  }
  if (isTreeAncestor(currentTree, nodeId, parentId)) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation',
      `Structural tree move cannot move node "${nodeId}" into its own subtree.`
    )
  }

  const previousParentId = currentNode.parentId
  const previousIndex = readNodeIndex(currentTree, previousParentId, nodeId)
  let nextTree = removeFromParent(currentTree, previousParentId, nodeId)
  const nextChildren = insertAtIndex(
    readParentChildren(nextTree, parentId),
    nodeId,
    index
  )
  nextTree = writeParentChildren(nextTree, parentId, nextChildren)
  nextTree = {
    ...nextTree,
    nodes: {
      ...nextTree.nodes,
      [nodeId]: {
        ...nextTree.nodes[nodeId]!,
        ...(parentId === undefined
          ? {}
          : {
              parentId
            })
      }
    }
  }
  if (parentId === undefined && 'parentId' in nextTree.nodes[nodeId]!) {
    const current = nextTree.nodes[nodeId]!
    const {
      parentId: _ignored,
      ...rest
    } = current
    nextTree = {
      ...nextTree,
      nodes: {
        ...nextTree.nodes,
        [nodeId]: rest
      }
    }
  }

  if (
    previousParentId === parentId
    && sameJsonValue(readParentChildren(nextTree, parentId), readParentChildren(currentTree, parentId))
  ) {
    return structuralSuccess({
      document: input.document,
      forward: [input.operation],
      inverse: [],
      structural: [],
      footprint: [],
      historyMode: 'neutral'
    })
  }

  const nextIndex = readNodeIndex(nextTree, parentId, nodeId)
  return structuralSuccess({
    document: input.spec.write(input.document, nextTree),
    forward: [input.operation],
    inverse: [createStructuralTreeMoveOperation<Op>({
      structure,
      nodeId,
      parentId: previousParentId,
      index: previousIndex < 0 ? undefined : previousIndex
    })],
    structural: [{
      kind: 'tree',
      action: 'move',
      structure,
      nodeId,
      parentId,
      index: nextIndex,
      previousParentId,
      previousIndex: previousIndex < 0 ? undefined : previousIndex
    }],
    footprint: treeFootprint(structure, nodeId, previousParentId, parentId)
  })
}

export const readStructuralOperationResult = <
  Doc extends object,
  Op extends {
    type: string
  },
  Code extends string = string
>(input: {
  document: Doc
  operation: Op
  structures?: MutationStructureTable<Doc>
  descriptor: StructuralDescriptor
}): MutationApplyResult<Doc, Op, Code> => {
  try {
    const structureName = readRequiredStructure(
      (input.operation as unknown as MutationStructuralCanonicalOperation).structure
    )
    const spec = input.structures?.[structureName]
    if (!spec) {
      return mutationFailure(
        'mutation_engine.apply.unknown_structure' as Code,
        `Unknown mutation structure "${structureName}".`
      )
    }

    if (input.descriptor.kind === 'ordered') {
      if (spec.kind !== 'ordered') {
        return mutationFailure(
          'mutation_engine.apply.invalid_operation' as Code,
          `Mutation structure "${structureName}" is not ordered.`
        )
      }

      return readOrderedOperationResult({
        document: input.document,
        operation: input.operation,
        spec,
        action: input.descriptor.action
      }) as MutationApplyResult<Doc, Op, Code>
    }

    if (spec.kind !== 'tree') {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation' as Code,
        `Mutation structure "${structureName}" is not a tree.`
      )
    }

    return readTreeOperationResult({
      document: input.document,
      operation: input.operation,
      spec,
      action: input.descriptor.action
    }) as MutationApplyResult<Doc, Op, Code>
  } catch (error) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation' as Code,
      error instanceof Error
        ? error.message
        : 'MutationEngine.apply received an invalid structural operation.'
    )
  }
}

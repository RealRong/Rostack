import type {
  MutationApplyResult,
  MutationFailure,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationOrderedSlot,
  MutationStructureSpec,
  MutationStructureSource,
  MutationStructureTable,
  MutationStructuralCanonicalOperation,
  MutationStructuralFact,
  MutationStructuralOrderedDeleteOperation,
  MutationStructuralOrderedInsertOperation,
  MutationStructuralOrderedMoveOperation,
  MutationStructuralOrderedPatchOperation,
  MutationStructuralOrderedSpliceOperation,
  MutationStructuralTreeDeleteOperation,
  MutationStructuralTreeInsertOperation,
  MutationStructuralTreeMoveOperation,
  MutationStructuralTreeNodePatchOperation,
  MutationStructuralTreeRestoreOperation,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
} from './contracts'
import {
  draft
} from '@shared/draft'
import {
  createMutationProgramWriter
} from './program/writer'
import {
  cloneValue,
  EMPTY_DELTA,
  EMPTY_ISSUES,
  EMPTY_OUTPUTS,
  mutationFailure,
  sameJsonValue,
} from './contracts'
import {
  buildStructureDelta
} from './delta'
import type {
  AppliedMutationProgram,
  MutationOrderedProgramStep,
  MutationProgram,
  MutationTreeProgramStep,
} from './program/program'

type StructuralDescriptor =
  | {
      kind: 'ordered'
      action: 'insert' | 'move' | 'splice' | 'delete' | 'patch'
    }
  | {
      kind: 'tree'
      action: 'insert' | 'move' | 'delete' | 'restore' | 'patch'
    }

type StructuralOperationApplyResult<
  Doc,
  Op,
  Code extends string = string
> =
  | {
      ok: true
      data: {
        document: Doc
        inverse: readonly Op[]
        structural: readonly MutationStructuralFact[]
        footprint: readonly MutationFootprint[]
        historyMode: 'track' | 'skip' | 'neutral'
      }
    }
  | MutationFailure<Code>

const ROOT_PARENT_ID = '$root'

const cloneOrderedItem = <TItem,>(
  item: TItem,
  spec: {
    clone?(item: TItem): TItem
  }
): TItem => spec.clone
  ? spec.clone(item)
  : cloneValue(item)

const isRecordObject = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const applyPatchedValue = <TValue, TPatch>(
  input: {
    current: TValue
    patch: TPatch
    apply?: (value: TValue, patch: TPatch) => TValue
    label: string
  }
): TValue => {
  if (input.apply) {
    return input.apply(input.current, input.patch)
  }
  if (!isRecordObject(input.current) || !isRecordObject(input.patch)) {
    throw new Error(`${input.label} requires a structure patch() implementation.`)
  }

  return draft.record.apply(
    input.current,
    input.patch
  ) as TValue
}

const readPatchDiff = <TValue, TPatch>(
  input: {
    before: TValue
    after: TValue
    diff?: (before: TValue, after: TValue) => TPatch
    label: string
  }
): TPatch => {
  if (input.diff) {
    return input.diff(input.before, input.after)
  }
  if (!isRecordObject(input.before) || !isRecordObject(input.after)) {
    throw new Error(`${input.label} requires a structure diff() implementation.`)
  }

  return draft.record.diff(
    input.before,
    input.after
  ) as TPatch
}

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

const readRequiredPatch = (
  value: unknown,
  label: string
): unknown => {
  if (value === undefined) {
    throw new Error(`${label} requires a patch.`)
  }

  return cloneValue(value)
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

const readOrderedSpliceItemIds = (
  value: unknown
): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new Error('Structural ordered splice operation requires itemIds.')
  }

  const normalized: string[] = []
  const seen = new Set<string>()
  value.forEach((entry) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error('Structural ordered splice operation itemIds must contain non-empty strings.')
    }
    if (seen.has(entry)) {
      return
    }
    seen.add(entry)
    normalized.push(entry)
  })

  if (!normalized.length) {
    throw new Error('Structural ordered splice operation requires at least one itemId.')
  }

  return normalized
}

const insertOrderedBlock = <TItem,>(
  items: readonly TItem[],
  itemIds: readonly string[],
  anchor: MutationOrderedAnchor,
  identify: (item: TItem) => string
): TItem[] => {
  const movingSet = new Set(itemIds)
  const block = items.filter((item) => movingSet.has(identify(item)))
  if (block.length === 0) {
    return [...items]
  }

  if (
    (anchor.kind === 'before' || anchor.kind === 'after')
    && movingSet.has(anchor.itemId)
  ) {
    return [...items]
  }

  const filtered = items.filter((item) => !movingSet.has(identify(item)))

  if (anchor.kind === 'start') {
    return [...block, ...filtered]
  }
  if (anchor.kind === 'end') {
    return [...filtered, ...block]
  }

  const anchorIndex = filtered.findIndex((entry) => identify(entry) === anchor.itemId)
  if (anchorIndex < 0) {
    return anchor.kind === 'before'
      ? [...block, ...filtered]
      : [...filtered, ...block]
  }

  return anchor.kind === 'before'
    ? [...filtered.slice(0, anchorIndex), ...block, ...filtered.slice(anchorIndex)]
    : [...filtered.slice(0, anchorIndex + 1), ...block, ...filtered.slice(anchorIndex + 1)]
}

const createOrderedMovePlan = (input: {
  currentIds: readonly string[]
  targetIds: readonly string[]
}): readonly {
  itemId: string
  to: MutationOrderedAnchor
}[] => {
  const working = [...input.currentIds]
  const moves: {
    itemId: string
    to: MutationOrderedAnchor
  }[] = []

  for (let index = 0; index < input.targetIds.length; index += 1) {
    const itemId = input.targetIds[index]!
    if (working[index] === itemId) {
      continue
    }

    const currentIndex = working.indexOf(itemId)
    if (currentIndex < 0) {
      continue
    }

    working.splice(currentIndex, 1)
    working.splice(index, 0, itemId)
    moves.push({
      itemId,
      to: index === 0
        ? {
            kind: 'start'
          }
        : {
            kind: 'after',
            itemId: input.targetIds[index - 1]!
          }
    })
  }

  return moves
}

const orderedSpliceFootprint = (
  structure: string,
  itemIds: readonly string[]
): readonly MutationFootprint[] => [
  {
    kind: 'structure',
    structure
  },
  ...itemIds.map((itemId) => ({
    kind: 'structure-item' as const,
    structure,
    id: itemId
  }))
]

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
  forward?: readonly Op[]
  inverse: readonly Op[]
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  historyMode?: 'track' | 'skip' | 'neutral'
}): StructuralOperationApplyResult<Doc, Op> => ({
  ok: true,
  data: {
    document: input.document,
    inverse: input.inverse,
    structural: input.structural,
    footprint: input.footprint,
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
    case 'structural.ordered.splice':
      return {
        kind: 'ordered',
        action: 'splice'
      }
    case 'structural.ordered.delete':
      return {
        kind: 'ordered',
        action: 'delete'
      }
    case 'structural.ordered.patch':
      return {
        kind: 'ordered',
        action: 'patch'
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
    case 'structural.tree.node.patch':
      return {
        kind: 'tree',
        action: 'patch'
      }
    default:
      return undefined
  }
}

const resolveStructureSpec = <Doc,>(
  source: MutationStructureSource<Doc> | undefined,
  structure: string
): MutationStructureSpec<Doc> | undefined => {
  if (!source) {
    return undefined
  }

  return typeof source === 'function'
    ? source(structure)
    : source[structure]
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

export const createStructuralOrderedSpliceOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralOrderedSpliceOperation, 'type'>
): Op => ({
  type: 'structural.ordered.splice',
  ...input
}) as unknown as Op

export const createStructuralOrderedDeleteOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralOrderedDeleteOperation, 'type'>
): Op => ({
  type: 'structural.ordered.delete',
  ...input
}) as unknown as Op

export const createStructuralOrderedPatchOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralOrderedPatchOperation, 'type'>
): Op => ({
  type: 'structural.ordered.patch',
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

export const createStructuralTreeNodePatchOperation = <Op extends { type: string }>(
  input: Omit<MutationStructuralTreeNodePatchOperation, 'type'>
): Op => ({
  type: 'structural.tree.node.patch',
  ...input
}) as unknown as Op

export const lowerStructuralOperation = (
  operation: MutationStructuralCanonicalOperation
): MutationProgram => {
  const builder = createMutationProgramWriter()

  switch (operation.type) {
    case 'structural.ordered.insert':
      builder.structure.ordered.insert(
        readRequiredStructure(operation.structure),
        readRequiredItemId(operation.itemId),
        operation.value,
        readRequiredOrderedAnchor(operation.to)
      )
      break
    case 'structural.ordered.move':
      builder.structure.ordered.move(
        readRequiredStructure(operation.structure),
        readRequiredItemId(operation.itemId),
        readRequiredOrderedAnchor(operation.to)
      )
      break
    case 'structural.ordered.splice':
      builder.structure.ordered.splice(
        readRequiredStructure(operation.structure),
        readOrderedSpliceItemIds(operation.itemIds),
        readRequiredOrderedAnchor(operation.to)
      )
      break
    case 'structural.ordered.delete':
      builder.structure.ordered.delete(
        readRequiredStructure(operation.structure),
        readRequiredItemId(operation.itemId)
      )
      break
    case 'structural.ordered.patch':
      builder.structure.ordered.patch(
        readRequiredStructure(operation.structure),
        readRequiredItemId(operation.itemId),
        readRequiredPatch(
          operation.patch,
          'Structural ordered patch operation'
        )
      )
      break
    case 'structural.tree.insert':
      builder.structure.tree.insert(
        readRequiredStructure(operation.structure),
        readRequiredNodeId(operation.nodeId),
        readOptionalParentId(operation.parentId),
        readOptionalIndex(operation.index),
        operation.value
      )
      break
    case 'structural.tree.move':
      builder.structure.tree.move(
        readRequiredStructure(operation.structure),
        readRequiredNodeId(operation.nodeId),
        readOptionalParentId(operation.parentId),
        readOptionalIndex(operation.index)
      )
      break
    case 'structural.tree.delete':
      builder.structure.tree.delete(
        readRequiredStructure(operation.structure),
        readRequiredNodeId(operation.nodeId)
      )
      break
    case 'structural.tree.restore':
      builder.structure.tree.restore(
        readRequiredStructure(operation.structure),
        readTreeSubtreeSnapshot(operation.snapshot)
      )
      break
    case 'structural.tree.node.patch':
      builder.structure.tree.patch(
        readRequiredStructure(operation.structure),
        readRequiredNodeId(operation.nodeId),
        readRequiredPatch(
          operation.patch,
          'Structural tree node patch operation'
        )
      )
      break
  }

  return builder.build()
}

const readOrderedOperationResult = <
  Doc extends object,
  Op extends {
    type: string
  }
>(input: {
  document: Doc
  operation: Op
  spec: Extract<MutationStructureSpec<Doc>, { kind: 'ordered' }>
  action: 'insert' | 'move' | 'splice' | 'delete' | 'patch'
}): StructuralOperationApplyResult<Doc, Op> => {
  const operation = input.operation as unknown as MutationStructuralOrderedInsertOperation
    | MutationStructuralOrderedMoveOperation
    | MutationStructuralOrderedSpliceOperation
    | MutationStructuralOrderedDeleteOperation
    | MutationStructuralOrderedPatchOperation
  const structure = readRequiredStructure(operation.structure)
  const items = input.spec.read(input.document)
  const identify = input.spec.identify
  const itemIds = items.map((item) => identify(item))

  if (input.action === 'insert') {
    const insertOperation = operation as MutationStructuralOrderedInsertOperation
    const itemId = readRequiredItemId(insertOperation.itemId)
    const currentIndex = itemIds.indexOf(itemId)
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

  if (input.action === 'splice') {
    const spliceOperation = operation as MutationStructuralOrderedSpliceOperation
    const movingIds = readOrderedSpliceItemIds(spliceOperation.itemIds)
    const missingId = movingIds.find((movingId) => !itemIds.includes(movingId))
    if (missingId) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural ordered splice cannot find item "${missingId}" in "${structure}".`
      )
    }

    const anchor = readRequiredOrderedAnchor(spliceOperation.to)
    const nextItems = insertOrderedBlock(items, movingIds, anchor, identify)
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

    const nextItemIds = nextItems.map((item) => identify(item))
    const inverseMoves = createOrderedMovePlan({
      currentIds: nextItemIds,
      targetIds: itemIds
    }).map(({ itemId, to }) => createStructuralOrderedMoveOperation<Op>({
      structure,
      itemId,
      to
    }))

    return structuralSuccess({
      document: input.spec.write(input.document, nextItems),
      forward: [input.operation],
      inverse: inverseMoves,
      structural: movingIds.map((movingId) => ({
        kind: 'ordered' as const,
        action: 'move' as const,
        structure,
        itemId: movingId,
        from: readOrderedSlot(itemIds, movingId),
        to: anchorFromSlot(readOrderedSlot(nextItemIds, movingId))
      })),
      footprint: orderedSpliceFootprint(structure, movingIds)
    })
  }

  if (input.action === 'patch') {
    const patchOperation = operation as MutationStructuralOrderedPatchOperation
    const itemId = readRequiredItemId(patchOperation.itemId)
    const currentIndex = itemIds.indexOf(itemId)
    if (currentIndex < 0) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural ordered patch cannot find item "${itemId}" in "${structure}".`
      )
    }

    const current = items[currentIndex]!
    const patch = readRequiredPatch(
      patchOperation.patch,
      'Structural ordered patch operation'
    )
    const next = applyPatchedValue({
      current,
      patch,
      apply: input.spec.patch,
      label: 'Structural ordered patch operation'
    })
    if (identify(next) !== itemId) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural ordered patch cannot change item id "${itemId}".`
      )
    }
    if (sameJsonValue(next, current)) {
      return structuralSuccess({
        document: input.document,
        inverse: [],
        structural: [],
        footprint: [],
        historyMode: 'neutral'
      })
    }

    const inversePatch = readPatchDiff({
      before: next,
      after: current,
      diff: input.spec.diff,
      label: 'Structural ordered patch operation'
    })
    const nextItems = [...items]
    nextItems[currentIndex] = cloneOrderedItem(next, input.spec)

    return structuralSuccess({
      document: input.spec.write(input.document, nextItems),
      inverse: [createStructuralOrderedPatchOperation<Op>({
        structure,
        itemId,
        patch: inversePatch
      })],
      structural: [{
        kind: 'ordered',
        action: 'patch',
        structure,
        itemId
      }],
      footprint: orderedFootprint(structure, itemId)
    })
  }

  const itemId = readRequiredItemId(
    (operation as MutationStructuralOrderedMoveOperation | MutationStructuralOrderedDeleteOperation).itemId
  )
  const currentIndex = itemIds.indexOf(itemId)

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
  action: 'insert' | 'move' | 'delete' | 'restore' | 'patch'
}): StructuralOperationApplyResult<Doc, Op> => {
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

  if (input.action === 'patch') {
    const operation = input.operation as unknown as MutationStructuralTreeNodePatchOperation
    const nodeId = readRequiredNodeId(operation.nodeId)
    const currentNode = currentTree.nodes[nodeId]
    if (!currentNode) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural tree node patch cannot find node "${nodeId}" in "${structure}".`
      )
    }
    if (currentNode.value === undefined) {
      return mutationFailure(
        'mutation_engine.apply.invalid_operation',
        `Structural tree node patch cannot patch missing value for "${nodeId}" in "${structure}".`
      )
    }

    const patch = readRequiredPatch(
      operation.patch,
      'Structural tree node patch operation'
    )
    const nextValue = applyPatchedValue({
      current: currentNode.value,
      patch,
      apply: input.spec.patch,
      label: 'Structural tree node patch operation'
    })
    if (sameJsonValue(nextValue, currentNode.value)) {
      return structuralSuccess({
        document: input.document,
        inverse: [],
        structural: [],
        footprint: [],
        historyMode: 'neutral'
      })
    }

    const inversePatch = readPatchDiff({
      before: nextValue,
      after: currentNode.value,
      diff: input.spec.diff,
      label: 'Structural tree node patch operation'
    })
    const nextTree: MutationTreeSnapshot = {
      ...currentTree,
      nodes: {
        ...currentTree.nodes,
        [nodeId]: {
          ...currentNode,
          value: input.spec.clone
            ? input.spec.clone(nextValue)
            : cloneValue(nextValue)
        }
      }
    }

    return structuralSuccess({
      document: input.spec.write(input.document, nextTree),
      inverse: [createStructuralTreeNodePatchOperation<Op>({
        structure,
        nodeId,
        patch: inversePatch
      })],
      structural: [{
        kind: 'tree',
        action: 'patch',
        structure,
        nodeId
      }],
      footprint: treeFootprint(structure, nodeId, currentNode.parentId)
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
  structures?: MutationStructureSource<Doc>
  descriptor: StructuralDescriptor
}): StructuralOperationApplyResult<Doc, Op, Code> => {
  try {
    const structureName = readRequiredStructure(
      (input.operation as unknown as MutationStructuralCanonicalOperation).structure
    )
    const spec = resolveStructureSpec(input.structures, structureName)
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
      }) as StructuralOperationApplyResult<Doc, Op, Code>
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
    }) as StructuralOperationApplyResult<Doc, Op, Code>
  } catch (error) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation' as Code,
      error instanceof Error
        ? error.message
        : 'MutationEngine.apply received an invalid structural operation.'
    )
  }
}

const lowerStructuralOperationBatch = (
  operations: readonly MutationStructuralCanonicalOperation[]
): MutationProgram => {
  const steps = operations.flatMap((operation) => lowerStructuralOperation(operation).steps)
  return {
    steps
  }
}

export const applyStructuralEffectResult = <
  Doc extends object
>(input: {
  document: Doc
  effect: MutationOrderedProgramStep | MutationTreeProgramStep
  structures?: MutationStructureSource<Doc>
}): AppliedMutationProgram<Doc> => {
  const operation: MutationStructuralCanonicalOperation = (() => {
    switch (input.effect.type) {
      case 'ordered.insert':
        return {
          type: 'structural.ordered.insert',
          structure: input.effect.structure,
          itemId: input.effect.itemId,
          value: input.effect.value,
          to: input.effect.to
        }
      case 'ordered.move':
        return {
          type: 'structural.ordered.move',
          structure: input.effect.structure,
          itemId: input.effect.itemId,
          to: input.effect.to
        }
      case 'ordered.splice':
        return {
          type: 'structural.ordered.splice',
          structure: input.effect.structure,
          itemIds: input.effect.itemIds,
          to: input.effect.to
        }
      case 'ordered.delete':
        return {
          type: 'structural.ordered.delete',
          structure: input.effect.structure,
          itemId: input.effect.itemId
        }
      case 'ordered.patch':
        return {
          type: 'structural.ordered.patch',
          structure: input.effect.structure,
          itemId: input.effect.itemId,
          patch: input.effect.patch
        }
      case 'tree.insert':
        return {
          type: 'structural.tree.insert',
          structure: input.effect.structure,
          nodeId: input.effect.nodeId,
          ...(input.effect.parentId === undefined
            ? {}
            : {
                parentId: input.effect.parentId
              }),
          ...(input.effect.index === undefined
            ? {}
            : {
                index: input.effect.index
              }),
          ...(input.effect.value === undefined
            ? {}
            : {
                value: input.effect.value
              })
        }
      case 'tree.move':
        return {
          type: 'structural.tree.move',
          structure: input.effect.structure,
          nodeId: input.effect.nodeId,
          ...(input.effect.parentId === undefined
            ? {}
            : {
                parentId: input.effect.parentId
              }),
          ...(input.effect.index === undefined
            ? {}
            : {
                index: input.effect.index
              })
        }
      case 'tree.delete':
        return {
          type: 'structural.tree.delete',
          structure: input.effect.structure,
          nodeId: input.effect.nodeId
        }
      case 'tree.restore':
        return {
          type: 'structural.tree.restore',
          structure: input.effect.structure,
          snapshot: input.effect.snapshot
        }
      case 'tree.node.patch':
        return {
          type: 'structural.tree.node.patch',
          structure: input.effect.structure,
          nodeId: input.effect.nodeId,
          patch: input.effect.patch
        }
    }
  })()
  const descriptor = readStructuralOperation(operation.type)
  if (!descriptor) {
    throw new Error(`Unknown structural effect "${input.effect.type}".`)
  }
  const spec = resolveStructureSpec(input.structures, operation.structure)
  if (!spec) {
    throw new Error(`Unknown mutation structure "${operation.structure}".`)
  }

  const applied = readStructuralOperationResult<Doc, MutationStructuralCanonicalOperation>({
    document: input.document,
    operation,
    structures: input.structures,
    descriptor
  })
  if (!applied.ok) {
    throw new Error(applied.error.message)
  }

  return {
    document: applied.data.document,
    inverse: lowerStructuralOperationBatch(
      applied.data.inverse as readonly MutationStructuralCanonicalOperation[]
    ),
    delta: buildStructureDelta(
      'change' in spec
        ? spec.change
        : undefined
    ),
    structural: applied.data.structural,
    footprint: applied.data.footprint,
    issues: EMPTY_ISSUES,
    historyMode: applied.data.historyMode === 'track'
      ? 'track'
      : 'neutral'
  }
}

export const readStructuralEffectResult = <
  Doc extends object,
  Code extends string = string
>(input: {
  document: Doc
  effect: MutationOrderedProgramStep | MutationTreeProgramStep
  structures?: MutationStructureSource<Doc>
}): {
  ok: true
  data: AppliedMutationProgram<Doc>
} | MutationFailure<Code> => {
  try {
    return {
      ok: true,
      data: applyStructuralEffectResult(input)
    }
  } catch (error) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation' as Code,
      error instanceof Error
        ? error.message
        : 'MutationEngine.apply received an invalid structural effect.'
    )
  }
}

export const applyStructuralOperation = <
  Doc extends object,
  Op extends {
    type: string
  },
  Code extends string = string
>(input: {
  document: Doc
  operation: Op
  structures?: MutationStructureSource<Doc>
}): MutationApplyResult<Doc, Op, Code> => {
  const descriptor = readStructuralOperation(input.operation.type)
  if (!descriptor) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation' as Code,
      `Unknown structural mutation operation "${input.operation.type}".`
    )
  }

  try {
    const program = lowerStructuralOperation(
      input.operation as unknown as MutationStructuralCanonicalOperation
    )
    const [effect] = program.steps
    if (
      !effect
      || effect.type === 'semantic.tag'
      || effect.type === 'semantic.change'
      || effect.type === 'semantic.footprint'
      || effect.type === 'entity.create'
      || effect.type === 'entity.patch'
      || effect.type === 'entity.patchMany'
      || effect.type === 'entity.delete'
    ) {
      throw new Error(`Unknown structural mutation operation "${input.operation.type}".`)
    }
    const applied = applyStructuralEffectResult<Doc>({
      document: input.document,
      effect,
      structures: input.structures
    })
    return {
      ok: true,
      data: {
        document: applied.document,
        applied: program,
        inverse: applied.inverse,
        delta: applied.delta,
        structural: applied.structural,
        footprint: applied.footprint,
        outputs: EMPTY_OUTPUTS,
        issues: applied.issues,
        historyMode: applied.historyMode
      }
    }
  } catch (error) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation' as Code,
      error instanceof Error
        ? error.message
        : 'MutationEngine.apply received an invalid structural operation.'
    )
  }
}

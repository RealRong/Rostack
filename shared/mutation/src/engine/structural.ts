import {
  draft
} from '@shared/draft'
import type {
  MutationFootprint,
  MutationIssue,
  MutationOrderedAnchor,
  MutationOrderedSlot,
  MutationStructuralFact,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
} from '../write'
import {
  type CompiledOrderedSpec,
  type CompiledTreeSpec,
  EMPTY_DELTA,
  EMPTY_ISSUES,
  EMPTY_OUTPUTS,
  mutationFailure,
  sameJsonValue,
} from './contracts'
import {
  buildStructureDelta,
} from './delta'
import type {
  AppliedMutationProgram,
  MutationOrderedProgramStep,
  MutationProgram,
  MutationProgramStep,
  MutationTreeProgramStep,
} from './program/program'

const ROOT_PARENT_ID = '$root'

const createMutationProgram = (
  steps: readonly MutationProgramStep[] = EMPTY_OUTPUTS as readonly MutationProgramStep[]
): MutationProgram => ({
  steps
})

type StructuralApplyData<Doc> = {
  document: Doc
  inverse: MutationProgram
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  historyMode: 'track' | 'neutral'
}

const cloneValue = <T,>(
  value: T
): T => structuredClone(value)

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

const structuralSuccess = <Doc extends object>(input: {
  document: Doc
  inverse: MutationProgram
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  historyMode?: 'track' | 'neutral'
}): StructuralApplyData<Doc> => ({
  document: input.document,
  inverse: input.inverse,
  structural: input.structural,
  footprint: input.footprint,
  historyMode: input.historyMode ?? 'track'
})

const isOrderedEffect = (
  effect: MutationOrderedProgramStep | MutationTreeProgramStep
): effect is MutationOrderedProgramStep => effect.target.kind === 'ordered'

const serializeMutationTarget = (
  target: MutationOrderedProgramStep['target'] | MutationTreeProgramStep['target']
): string => target.key === undefined
  ? target.type
  : `${target.type}:${target.key}`

const readStructureChanges = (
  change: CompiledOrderedSpec<unknown, unknown, unknown>['change']
    | CompiledTreeSpec<unknown, unknown, unknown>['change'],
  key: string | undefined
) => typeof change === 'function'
  ? change(key)
  : change

const applyOrderedStep = <Doc extends object>(input: {
  document: Doc
  effect: MutationOrderedProgramStep
  spec: CompiledOrderedSpec<Doc, unknown, unknown>
}): StructuralApplyData<Doc> => {
  const structure = serializeMutationTarget(input.effect.target)
  const items = input.spec.read(input.document, input.effect.target.key)
  const identify = input.spec.identify
  const itemIds = items.map((item) => identify(item))

  if (input.effect.type === 'ordered.insert') {
    const itemId = readRequiredItemId(input.effect.itemId)
    if (itemIds.includes(itemId)) {
      throw new Error(`Structural ordered insert found an existing item "${itemId}" in "${structure}".`)
    }

    const nextValue = cloneOrderedItem(input.effect.value, input.spec)
    if (identify(nextValue) !== itemId) {
      throw new Error(`Structural ordered insert value id does not match itemId "${itemId}".`)
    }

    const anchor = readRequiredOrderedAnchor(input.effect.to)
    const nextItems = insertOrderedItem(items, nextValue, anchor, identify)
    return structuralSuccess({
      document: input.spec.write(input.document, input.effect.target.key, nextItems),
      inverse: createMutationProgram([{
        type: 'ordered.delete',
        target: input.effect.target,
        itemId
      }]),
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

  if (input.effect.type === 'ordered.splice') {
    const movingIds = readOrderedSpliceItemIds(input.effect.itemIds)
    const missingId = movingIds.find((movingId) => !itemIds.includes(movingId))
    if (missingId) {
      throw new Error(`Structural ordered splice cannot find item "${missingId}" in "${structure}".`)
    }

    const anchor = readRequiredOrderedAnchor(input.effect.to)
    const nextItems = insertOrderedBlock(items, movingIds, anchor, identify)
    if (sameJsonValue(nextItems, items)) {
      return structuralSuccess({
        document: input.document,
        inverse: createMutationProgram(),
        structural: [],
        footprint: [],
        historyMode: 'neutral'
      })
    }

    const nextItemIds = nextItems.map((item) => identify(item))
    const inverseMoves = createOrderedMovePlan({
      currentIds: nextItemIds,
      targetIds: itemIds
    }).map(({ itemId, to }) => ({
      type: 'ordered.move' as const,
      target: input.effect.target,
      itemId,
      to
    }))

    return structuralSuccess({
      document: input.spec.write(input.document, input.effect.target.key, nextItems),
      inverse: createMutationProgram(inverseMoves),
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

  if (input.effect.type === 'ordered.patch') {
    const itemId = readRequiredItemId(input.effect.itemId)
    const currentIndex = itemIds.indexOf(itemId)
    if (currentIndex < 0) {
      throw new Error(`Structural ordered patch cannot find item "${itemId}" in "${structure}".`)
    }

    const current = items[currentIndex]!
    const next = applyPatchedValue({
      current,
      patch: cloneValue(input.effect.patch),
      apply: input.spec.patch,
      label: 'Structural ordered patch operation'
    })
    if (identify(next) !== itemId) {
      throw new Error(`Structural ordered patch cannot change item id "${itemId}".`)
    }
    if (sameJsonValue(next, current)) {
      return structuralSuccess({
        document: input.document,
        inverse: createMutationProgram(),
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
      document: input.spec.write(input.document, input.effect.target.key, nextItems),
      inverse: createMutationProgram([{
        type: 'ordered.patch',
        target: input.effect.target,
        itemId,
        patch: inversePatch
      }]),
      structural: [{
        kind: 'ordered',
        action: 'patch',
        structure,
        itemId
      }],
      footprint: orderedFootprint(structure, itemId)
    })
  }

  const itemId = readRequiredItemId(input.effect.itemId)
  const currentIndex = itemIds.indexOf(itemId)
  if (currentIndex < 0) {
    throw new Error(`Structural ordered operation cannot find item "${itemId}" in "${structure}".`)
  }

  const currentSlot = readOrderedSlot(itemIds, itemId)

  if (input.effect.type === 'ordered.delete') {
    const value = cloneOrderedItem(items[currentIndex]!, input.spec)
    const nextItems = removeOrderedItem(items, itemId, identify)
    return structuralSuccess({
      document: input.spec.write(input.document, input.effect.target.key, nextItems),
      inverse: createMutationProgram([{
        type: 'ordered.insert',
        target: input.effect.target,
        itemId,
        value,
        to: anchorFromSlot(currentSlot)
      }]),
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

  const anchor = readRequiredOrderedAnchor(input.effect.to)
  const nextItems = insertOrderedItem(
    items,
    items[currentIndex]!,
    anchor,
    identify
  )
  if (sameJsonValue(nextItems, items)) {
    return structuralSuccess({
      document: input.document,
      inverse: createMutationProgram(),
      structural: [],
      footprint: [],
      historyMode: 'neutral'
    })
  }

  return structuralSuccess({
    document: input.spec.write(input.document, input.effect.target.key, nextItems),
    inverse: createMutationProgram([{
      type: 'ordered.move',
      target: input.effect.target,
      itemId,
      to: anchorFromSlot(currentSlot)
    }]),
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

const applyTreeStep = <Doc extends object>(input: {
  document: Doc
  effect: MutationTreeProgramStep
  spec: CompiledTreeSpec<Doc, unknown, unknown>
}): StructuralApplyData<Doc> => {
  const structure = serializeMutationTarget(input.effect.target)
  const currentTree = cloneTreeSnapshot(
    input.spec.read(input.document, input.effect.target.key)
  )

  if (input.effect.type === 'tree.insert') {
    const nodeId = readRequiredNodeId(input.effect.nodeId)
    const parentId = readOptionalParentId(input.effect.parentId)
    const index = readOptionalIndex(input.effect.index)
    if (currentTree.nodes[nodeId]) {
      throw new Error(`Structural tree insert found an existing node "${nodeId}" in "${structure}".`)
    }
    if (parentId && !currentTree.nodes[parentId]) {
      throw new Error(`Structural tree insert cannot find parent "${parentId}" in "${structure}".`)
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
          ...(input.effect.value === undefined
            ? {}
            : {
                value: input.spec.clone
                  ? input.spec.clone(input.effect.value)
                  : cloneValue(input.effect.value)
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
      document: input.spec.write(input.document, input.effect.target.key, writtenTree),
      inverse: createMutationProgram([{
        type: 'tree.delete',
        target: input.effect.target,
        nodeId
      }]),
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

  if (input.effect.type === 'tree.restore') {
    const snapshot = readTreeSubtreeSnapshot(input.effect.snapshot)
    if (currentTree.nodes[snapshot.rootId]) {
      throw new Error(`Structural tree restore found an existing node "${snapshot.rootId}" in "${structure}".`)
    }
    if (snapshot.parentId && !currentTree.nodes[snapshot.parentId]) {
      throw new Error(`Structural tree restore cannot find parent "${snapshot.parentId}" in "${structure}".`)
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
      document: input.spec.write(input.document, input.effect.target.key, writtenTree),
      inverse: createMutationProgram([{
        type: 'tree.delete',
        target: input.effect.target,
        nodeId: snapshot.rootId
      }]),
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

  if (input.effect.type === 'tree.node.patch') {
    const nodeId = readRequiredNodeId(input.effect.nodeId)
    const currentNode = currentTree.nodes[nodeId]
    if (!currentNode) {
      throw new Error(`Structural tree node patch cannot find node "${nodeId}" in "${structure}".`)
    }
    if (currentNode.value === undefined) {
      throw new Error(`Structural tree node patch cannot patch missing value for "${nodeId}" in "${structure}".`)
    }

    const nextValue = applyPatchedValue({
      current: currentNode.value,
      patch: cloneValue(input.effect.patch),
      apply: input.spec.patch,
      label: 'Structural tree node patch operation'
    })
    if (sameJsonValue(nextValue, currentNode.value)) {
      return structuralSuccess({
        document: input.document,
        inverse: createMutationProgram(),
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
      document: input.spec.write(input.document, input.effect.target.key, nextTree),
      inverse: createMutationProgram([{
        type: 'tree.node.patch',
        target: input.effect.target,
        nodeId,
        patch: inversePatch
      }]),
      structural: [{
        kind: 'tree',
        action: 'patch',
        structure,
        nodeId
      }],
      footprint: treeFootprint(structure, nodeId, currentNode.parentId)
    })
  }

  const nodeId = readRequiredNodeId(input.effect.nodeId)
  const currentNode = currentTree.nodes[nodeId]
  if (!currentNode) {
    throw new Error(`Structural tree operation cannot find node "${nodeId}" in "${structure}".`)
  }

  if (input.effect.type === 'tree.delete') {
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
      document: input.spec.write(input.document, input.effect.target.key, nextTree),
      inverse: createMutationProgram([{
        type: 'tree.restore',
        target: input.effect.target,
        snapshot
      }]),
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

  const parentId = readOptionalParentId(input.effect.parentId)
  const index = readOptionalIndex(input.effect.index)
  if (parentId && !currentTree.nodes[parentId]) {
    throw new Error(`Structural tree move cannot find parent "${parentId}" in "${structure}".`)
  }
  if (isTreeAncestor(currentTree, nodeId, parentId)) {
    throw new Error(`Structural tree move cannot move node "${nodeId}" into its own subtree.`)
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
      inverse: createMutationProgram(),
      structural: [],
      footprint: [],
      historyMode: 'neutral'
    })
  }

  const nextIndex = readNodeIndex(nextTree, parentId, nodeId)
  return structuralSuccess({
    document: input.spec.write(input.document, input.effect.target.key, nextTree),
    inverse: createMutationProgram([{
      type: 'tree.move',
      target: input.effect.target,
      nodeId,
      ...(previousParentId === undefined
        ? {}
        : {
            parentId: previousParentId
          }),
      ...(previousIndex < 0
        ? {}
        : {
            index: previousIndex
          })
    }]),
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

export const applyStructuralEffectResult = <
  Doc extends object
>(input: {
  document: Doc
  effect: MutationOrderedProgramStep | MutationTreeProgramStep
  ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
}): AppliedMutationProgram<Doc> => {
  try {
    if (isOrderedEffect(input.effect)) {
      const effect = input.effect
      const spec = input.ordered.get(effect.target.type)
      if (!spec) {
        throw new Error(`Unknown mutation ordered target "${effect.target.type}".`)
      }

      const applied = applyOrderedStep({
        document: input.document,
        effect,
        spec
      })
      return {
        document: applied.document,
        inverse: applied.inverse,
        delta: buildStructureDelta(
          readStructureChanges(
            spec.change,
            effect.target.key
          )
        ),
        structural: applied.structural,
        footprint: applied.footprint,
        issues: EMPTY_ISSUES,
        historyMode: applied.historyMode
      }
    }

    const effect = input.effect
    const spec = input.tree.get(effect.target.type)
    if (!spec) {
      throw new Error(`Unknown mutation tree target "${effect.target.type}".`)
    }

    const applied = applyTreeStep({
      document: input.document,
      effect,
      spec
    })
    return {
      document: applied.document,
      inverse: applied.inverse,
        delta: buildStructureDelta(
          readStructureChanges(
            spec.change,
            effect.target.key
          )
        ),
      structural: applied.structural,
      footprint: applied.footprint,
      issues: EMPTY_ISSUES,
      historyMode: applied.historyMode
    }
  } catch (error) {
    throw error
  }
}

export const readStructuralEffectResult = <
  Doc extends object,
  Code extends string = string
>(input: {
  document: Doc
  effect: MutationOrderedProgramStep | MutationTreeProgramStep
  ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
}): {
  ok: true
  data: AppliedMutationProgram<Doc>
} | ReturnType<typeof mutationFailure<Code>> => {
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

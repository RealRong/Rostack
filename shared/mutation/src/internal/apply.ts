import type {
  CompiledMutationNode,
  CompiledMutationSchema,
  CompiledMutationTableNode,
  CompiledMutationMapNode,
  CompiledMutationTreeNode,
  CompiledMutationSequenceNode
} from '../compile/schema'
import {
  getCompiledMutationSchema
} from '../compile/schema'
import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationDocument
} from '../schema/value'
import type {
  MutationEntityTarget,
  MutationScope,
  MutationWrite
} from '../writer/writes'

export type MutationApplyResult<TSchema extends MutationSchema> = {
  document: MutationDocument<TSchema>
  inverse: readonly MutationWrite[]
}

type MutationCowDraft = {
  root: Record<string, unknown>
  readonly copies: WeakMap<object, object>
  readonly mutable: WeakSet<object>
}

type RuntimeEntityValue = Record<string, unknown>

type RuntimeTableValue = {
  ids: string[]
  byId: Record<string, RuntimeEntityValue | undefined>
}

type RuntimeMapValue = Record<string, RuntimeEntityValue | undefined>

type MutationApplyContext = {
  readonly compiled: CompiledMutationSchema
  readonly lineageCache: Map<number, readonly CompiledMutationNode[]>
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const cloneTarget = (
  target?: MutationEntityTarget
): MutationEntityTarget | undefined => target
  ? {
      scope: [...target.scope],
      id: target.id
    }
  : undefined

const cloneValue = <TValue>(
  value: TValue
): TValue => value === undefined
  ? value
  : structuredClone(value)

const createMutableObject = (): Record<string, unknown> => ({})
const createMutableArray = <TValue>(): TValue[] => []

const createMutableTable = (): RuntimeTableValue => ({
  ids: [],
  byId: {}
})

const createMutableMap = (): RuntimeMapValue => ({})

const createMutableTree = (): import('../schema/constants').MutationTreeSnapshot<unknown> => ({
  rootId: undefined,
  nodes: {}
})

const createCowDraft = <TSchema extends MutationSchema>(
  document: MutationDocument<TSchema>
): MutationCowDraft => {
  const root = isRecord(document)
    ? {
        ...document
      }
    : {}

  const mutable = new WeakSet<object>()
  mutable.add(root)

  return {
    root,
    copies: new WeakMap<object, object>(),
    mutable
  }
}

const ensureMutableObject = <TValue extends object>(
  draft: MutationCowDraft,
  value: TValue
): TValue => {
  if (draft.mutable.has(value)) {
    return value
  }

  const existing = draft.copies.get(value)
  if (existing) {
    return existing as TValue
  }

  const clone = Array.isArray(value)
    ? [...value]
    : {
        ...value
      }

  draft.copies.set(value, clone)
  draft.mutable.add(clone)
  return clone as TValue
}

const getLineage = (
  context: MutationApplyContext,
  nodeId: number
): readonly CompiledMutationNode[] => {
  const cached = context.lineageCache.get(nodeId)
  if (cached) {
    return cached
  }

  const lineage: CompiledMutationNode[] = []
  let current: CompiledMutationNode | undefined = context.compiled.nodes[nodeId]

  if (!current) {
    throw new Error(`Unknown compiled mutation node ${nodeId}.`)
  }

  while (current) {
    lineage.push(current)
    current = current.parentNodeId === undefined
      ? undefined
      : context.compiled.nodes[current.parentNodeId]
  }

  lineage.reverse()
  context.lineageCache.set(nodeId, lineage)
  return lineage
}

const isEntityObjectStep = (
  parent: CompiledMutationNode,
  next?: CompiledMutationNode
): boolean => next?.kind === 'object'
  && next.key === undefined
  && next.parentNodeId === parent.nodeId
  && (parent.kind === 'table' || parent.kind === 'map')

const targetEntityIds = (target?: MutationEntityTarget): readonly string[] => target
  ? [...target.scope, target.id]
  : []

const targetScopeIds = (target?: MutationEntityTarget): readonly string[] => target?.scope ?? []

const readObjectProperty = (
  owner: unknown,
  key: string
): unknown => isRecord(owner)
  ? owner[key]
  : undefined

const readLineageValue = (
  root: unknown,
  lineage: readonly CompiledMutationNode[],
  entityIds: readonly string[]
): unknown => {
  let current: unknown = root
  let entityIndex = 0

  for (let index = 1; index < lineage.length; index += 1) {
    const node = lineage[index]
    const next = lineage[index + 1]

    switch (node.kind) {
      case 'object':
        if (node.key !== undefined) {
          current = readObjectProperty(current, node.key)
        }
        break

      case 'field':
      case 'dictionary':
      case 'sequence':
      case 'tree':
      case 'singleton':
        current = node.key === undefined
          ? current
          : readObjectProperty(current, node.key)
        break

      case 'table': {
        const table = node.key === undefined
          ? current
          : readObjectProperty(current, node.key)

        if (!isEntityObjectStep(node, next)) {
          current = table
          break
        }

        const entityId = entityIds[entityIndex++]
        current = isRecord(table) && isRecord(table.byId)
          ? table.byId[entityId]
          : undefined
        break
      }

      case 'map': {
        const mapValue = node.key === undefined
          ? current
          : readObjectProperty(current, node.key)

        if (!isEntityObjectStep(node, next)) {
          current = mapValue
          break
        }

        const entityId = entityIds[entityIndex++]
        current = isRecord(mapValue)
          ? mapValue[entityId]
          : undefined
        break
      }
    }
  }

  return current
}

const ensureObjectProperty = (
  draft: MutationCowDraft,
  owner: Record<string, unknown>,
  key: string,
  createFallback: () => Record<string, unknown> = createMutableObject
): Record<string, unknown> => {
  const current = owner[key]

  if (!isRecord(current)) {
    const next = createFallback()
    draft.mutable.add(next)
    owner[key] = next
    return next
  }

  const next = ensureMutableObject(draft, current)
  if (next !== current) {
    owner[key] = next
  }
  return next
}

const ensureArrayProperty = (
  draft: MutationCowDraft,
  owner: Record<string, unknown>,
  key: string
): unknown[] => {
  const current = owner[key]

  if (!Array.isArray(current)) {
    const next = createMutableArray<unknown>()
    draft.mutable.add(next)
    owner[key] = next
    return next
  }

  const next = ensureMutableObject(draft, current)
  if (next !== current) {
    owner[key] = next
  }
  return next
}

const ensureTableProperty = (
  draft: MutationCowDraft,
  owner: Record<string, unknown>,
  key: string
): RuntimeTableValue => {
  const current = owner[key]

  if (!isRecord(current)) {
    const next = createMutableTable()
    draft.mutable.add(next)
    draft.mutable.add(next.byId)
    draft.mutable.add(next.ids)
    owner[key] = next
    return next
  }

  const table = ensureMutableObject(draft, current) as RuntimeTableValue
  if (table !== current) {
    owner[key] = table
  }

  table.ids = Array.isArray(table.ids)
    ? ensureMutableObject(draft, table.ids)
    : createMutableArray<string>()
  if (!Array.isArray(table.ids)) {
    table.ids = createMutableArray<string>()
  }
  if (!draft.mutable.has(table.ids)) {
    draft.mutable.add(table.ids)
  }

  table.byId = isRecord(table.byId)
    ? ensureMutableObject(draft, table.byId) as RuntimeTableValue['byId']
    : createMutableObject() as RuntimeTableValue['byId']
  if (!draft.mutable.has(table.byId)) {
    draft.mutable.add(table.byId)
  }

  return table as RuntimeTableValue
}

const ensureMapProperty = (
  draft: MutationCowDraft,
  owner: Record<string, unknown>,
  key: string
): RuntimeMapValue => {
  const current = owner[key]

  if (!isRecord(current)) {
    const next = createMutableMap()
    draft.mutable.add(next)
    owner[key] = next
    return next
  }

  const next = ensureMutableObject(draft, current)
  if (next !== current) {
    owner[key] = next
  }
  return next as RuntimeMapValue
}

const ensureTreeProperty = (
  draft: MutationCowDraft,
  owner: Record<string, unknown>,
  key: string
): import('../schema/constants').MutationTreeSnapshot<unknown> => {
  const current = owner[key]

  if (!isRecord(current)) {
    const next = createMutableTree()
    draft.mutable.add(next)
    draft.mutable.add(next.nodes)
    owner[key] = next
    return next
  }

  const tree = ensureMutableObject(
    draft,
    current
  ) as import('../schema/constants').MutationTreeSnapshot<unknown>
  if (tree !== current) {
    owner[key] = tree
  }

  tree.nodes = isRecord(tree.nodes)
    ? ensureMutableObject(draft, tree.nodes) as import('../schema/constants').MutationTreeSnapshot<unknown>['nodes']
    : createMutableObject() as import('../schema/constants').MutationTreeSnapshot<unknown>['nodes']
  if (!draft.mutable.has(tree.nodes)) {
    draft.mutable.add(tree.nodes)
  }

  return tree as import('../schema/constants').MutationTreeSnapshot<unknown>
}

const ensureTableEntity = (
  draft: MutationCowDraft,
  table: RuntimeTableValue,
  entityId: string
): Record<string, unknown> => {
  const current = table.byId[entityId]

  if (!isRecord(current)) {
    const next = createMutableObject()
    draft.mutable.add(next)
    table.byId[entityId] = next
    return next
  }

  const next = ensureMutableObject(draft, current)
  if (next !== current) {
    table.byId[entityId] = next
  }
  return next
}

const ensureMapEntity = (
  draft: MutationCowDraft,
  mapValue: RuntimeMapValue,
  entityId: string
): Record<string, unknown> => {
  const current = mapValue[entityId]

  if (!isRecord(current)) {
    const next = createMutableObject()
    draft.mutable.add(next)
    mapValue[entityId] = next
    return next
  }

  const next = ensureMutableObject(draft, current)
  if (next !== current) {
    mapValue[entityId] = next
  }
  return next
}

const ensureLineageValue = (
  draft: MutationCowDraft,
  lineage: readonly CompiledMutationNode[],
  entityIds: readonly string[]
): unknown => {
  let current: unknown = draft.root
  let entityIndex = 0

  for (let index = 1; index < lineage.length; index += 1) {
    const node = lineage[index]
    const next = lineage[index + 1]

    if (!isRecord(current)) {
      current = createMutableObject()
    }

    const owner = current as Record<string, unknown>

    switch (node.kind) {
      case 'object':
        if (node.key !== undefined) {
          current = ensureObjectProperty(draft, owner, node.key)
        }
        break

      case 'singleton':
        if (node.key === undefined) {
          break
        }
        current = ensureObjectProperty(draft, owner, node.key)
        break

      case 'table': {
        const table = node.key === undefined
          ? owner
          : ensureTableProperty(draft, owner, node.key)

        if (!isEntityObjectStep(node, next)) {
          current = table
          break
        }

        const entityId = entityIds[entityIndex++]
        current = ensureTableEntity(
          draft,
          table as RuntimeTableValue,
          entityId
        )
        break
      }

      case 'map': {
        const mapValue = node.key === undefined
          ? owner
          : ensureMapProperty(draft, owner, node.key)

        if (!isEntityObjectStep(node, next)) {
          current = mapValue
          break
        }

        const entityId = entityIds[entityIndex++]
        current = ensureMapEntity(
          draft,
          mapValue as RuntimeMapValue,
          entityId
        )
        break
      }

      case 'field':
        current = node.key === undefined
          ? owner
          : ensureObjectProperty(draft, owner, node.key)
        break

      case 'dictionary':
        current = node.key === undefined
          ? owner
          : ensureObjectProperty(draft, owner, node.key)
        break

      case 'sequence':
        current = node.key === undefined
          ? owner
          : ensureArrayProperty(draft, owner, node.key)
        break

      case 'tree':
        current = node.key === undefined
          ? owner
          : ensureTreeProperty(draft, owner, node.key)
        break
    }
  }

  return current
}

const ensureParentObjectForLeaf = (
  draft: MutationCowDraft,
  context: MutationApplyContext,
  node: CompiledMutationNode,
  target?: MutationEntityTarget
): {
  owner: Record<string, unknown>
  key: string
} => {
  const lineage = getLineage(context, node.nodeId)
  const parentLineage = lineage.slice(0, -1)
  const owner = ensureLineageValue(draft, parentLineage, targetEntityIds(target))

  if (!isRecord(owner) || node.key === undefined) {
    throw new Error(`Unable to resolve mutable owner for mutation node ${node.nodeId}.`)
  }

  return {
    owner,
    key: node.key
  }
}

const readNodeValue = (
  context: MutationApplyContext,
  root: unknown,
  node: CompiledMutationNode,
  target?: MutationEntityTarget
): unknown => readLineageValue(root, getLineage(context, node.nodeId), targetEntityIds(target))

const readCollectionValue = (
  context: MutationApplyContext,
  root: unknown,
  node: CompiledMutationTableNode | CompiledMutationMapNode,
  target?: MutationEntityTarget
): unknown => readLineageValue(root, getLineage(context, node.nodeId), targetScopeIds(target))

const readEntityValue = (
  context: MutationApplyContext,
  root: unknown,
  node: CompiledMutationTableNode | CompiledMutationMapNode,
  target?: MutationEntityTarget
): unknown => readLineageValue(root, getLineage(context, node.entity.nodeId), targetEntityIds(target))

const ensureCollectionValue = (
  draft: MutationCowDraft,
  context: MutationApplyContext,
  node: CompiledMutationTableNode | CompiledMutationMapNode,
  target?: MutationEntityTarget
): unknown => ensureLineageValue(draft, getLineage(context, node.nodeId), targetScopeIds(target))

const findSequenceIndex = (
  node: CompiledMutationSequenceNode,
  items: readonly unknown[],
  value: unknown
): number => {
  const key = node.keyOf(value)
  return items.findIndex((item) => node.keyOf(item) === key)
}

const insertWithAnchor = (
  values: unknown[],
  value: unknown,
  anchor?: import('../schema/constants').MutationSequenceAnchor
): void => {
  if (!anchor) {
    values.push(value)
    return
  }

  if ('before' in anchor) {
    const index = values.findIndex((item) => item === anchor.before || (isRecord(item) && item.id === anchor.before))
    if (index >= 0) {
      values.splice(index, 0, value)
      return
    }
    values.push(value)
    return
  }

  if ('after' in anchor) {
    const index = values.findIndex((item) => item === anchor.after || (isRecord(item) && item.id === anchor.after))
    if (index >= 0) {
      values.splice(index + 1, 0, value)
      return
    }
    values.push(value)
    return
  }

  if (anchor.at === 'start') {
    values.unshift(value)
    return
  }

  values.push(value)
}

const removeId = (
  ids: string[],
  id: string
): void => {
  const index = ids.indexOf(id)
  if (index >= 0) {
    ids.splice(index, 1)
  }
}

const insertIdWithAnchor = (
  ids: string[],
  id: string,
  anchor?: import('../schema/constants').MutationSequenceAnchor
): void => {
  removeId(ids, id)

  if (!anchor) {
    ids.push(id)
    return
  }

  if ('before' in anchor) {
    const index = ids.indexOf(anchor.before)
    if (index >= 0) {
      ids.splice(index, 0, id)
      return
    }
    ids.push(id)
    return
  }

  if ('after' in anchor) {
    const index = ids.indexOf(anchor.after)
    if (index >= 0) {
      ids.splice(index + 1, 0, id)
      return
    }
    ids.push(id)
    return
  }

  if (anchor.at === 'start') {
    ids.unshift(id)
    return
  }

  ids.push(id)
}

const anchorForId = (
  ids: readonly string[],
  id: string
): import('../schema/constants').MutationSequenceAnchor => {
  const index = ids.indexOf(id)
  const next = index >= 0
    ? ids[index + 1]
    : undefined
  const previous = index > 0
    ? ids[index - 1]
    : undefined

  if (next !== undefined) {
    return {
      before: next
    }
  }

  if (previous !== undefined) {
    return {
      after: previous
    }
  }

  return {
    at: 'start'
  }
}

const ensureTreeNode = (
  draft: MutationCowDraft,
  tree: import('../schema/constants').MutationTreeSnapshot<unknown>,
  treeNodeId: string
): import('../schema/constants').MutationTreeNodeSnapshot<unknown> => {
  const current = tree.nodes[treeNodeId]

  if (!isRecord(current)) {
    const next: import('../schema/constants').MutationTreeNodeSnapshot<unknown> = {
      parentId: undefined,
      children: []
    }
    draft.mutable.add(next)
    draft.mutable.add(next.children)
    tree.nodes[treeNodeId] = next
    return next
  }

  const node = ensureMutableObject(draft, current)
  if (node !== current) {
    tree.nodes[treeNodeId] = node
  }

  node.children = Array.isArray(node.children)
    ? ensureMutableObject(draft, node.children)
    : createMutableArray<string>()
  if (!draft.mutable.has(node.children)) {
    draft.mutable.add(node.children)
  }

  return node as import('../schema/constants').MutationTreeNodeSnapshot<unknown>
}

const removeTreeFromParent = (
  draft: MutationCowDraft,
  tree: import('../schema/constants').MutationTreeSnapshot<unknown>,
  treeNodeId: string
): void => {
  const node = tree.nodes[treeNodeId]
  if (!node) {
    return
  }

  if (node.parentId === undefined) {
    if (tree.rootId === treeNodeId) {
      tree.rootId = undefined
    }
    return
  }

  const parent = ensureTreeNode(draft, tree, node.parentId)
  const index = parent.children.indexOf(treeNodeId)
  if (index >= 0) {
    parent.children.splice(index, 1)
  }
}

const insertTreeIntoParent = (
  draft: MutationCowDraft,
  tree: import('../schema/constants').MutationTreeSnapshot<unknown>,
  treeNodeId: string,
  parentId: string | undefined,
  index?: number
): void => {
  const node = ensureTreeNode(draft, tree, treeNodeId)
  node.parentId = parentId

  if (parentId === undefined) {
    tree.rootId = treeNodeId
    return
  }

  const parent = ensureTreeNode(draft, tree, parentId)
  const insertIndex = index === undefined
    ? parent.children.length
    : Math.max(0, Math.min(index, parent.children.length))
  parent.children.splice(insertIndex, 0, treeNodeId)
}

const removeTreeSubtree = (
  draft: MutationCowDraft,
  tree: import('../schema/constants').MutationTreeSnapshot<unknown>,
  treeNodeId: string
): void => {
  const node = tree.nodes[treeNodeId]
  if (!node) {
    return
  }

  removeTreeFromParent(draft, tree, treeNodeId)

  for (const childId of [...node.children]) {
    removeTreeSubtree(draft, tree, childId)
  }

  delete tree.nodes[treeNodeId]
  if (tree.rootId === treeNodeId) {
    tree.rootId = undefined
  }
}

const applyWrite = (
  draft: MutationCowDraft,
  context: MutationApplyContext,
  inverse: MutationWrite[],
  write: MutationWrite
): void => {
  const node = context.compiled.nodes[write.nodeId]
  if (!node) {
    throw new Error(`Unknown compiled mutation node ${write.nodeId}.`)
  }

  switch (write.kind) {
    case 'field.set': {
      const before = cloneValue(readNodeValue(context, draft.root, node, write.target))
      inverse.push({
        kind: 'field.set',
        nodeId: write.nodeId,
        target: cloneTarget(write.target),
        value: before
      })

      const { owner, key } = ensureParentObjectForLeaf(draft, context, node, write.target)
      owner[key] = cloneValue(write.value)
      return
    }

    case 'dictionary.set': {
      const beforeValue = readNodeValue(context, draft.root, node, write.target)
      const beforeRecord = isRecord(beforeValue)
        ? beforeValue
        : undefined
      inverse.push(beforeRecord && write.key in beforeRecord
        ? {
            kind: 'dictionary.set',
            nodeId: write.nodeId,
            target: cloneTarget(write.target),
            key: write.key,
            value: cloneValue(beforeRecord[write.key])
          }
        : {
            kind: 'dictionary.delete',
            nodeId: write.nodeId,
            target: cloneTarget(write.target),
            key: write.key
          })

      const { owner, key } = ensureParentObjectForLeaf(draft, context, node, write.target)
      const dictionary = ensureObjectProperty(draft, owner, key)
      dictionary[write.key] = cloneValue(write.value)
      return
    }

    case 'dictionary.delete': {
      const beforeValue = readNodeValue(context, draft.root, node, write.target)
      const beforeRecord = isRecord(beforeValue)
        ? beforeValue
        : undefined
      inverse.push(beforeRecord && write.key in beforeRecord
        ? {
            kind: 'dictionary.set',
            nodeId: write.nodeId,
            target: cloneTarget(write.target),
            key: write.key,
            value: cloneValue(beforeRecord[write.key])
          }
        : {
            kind: 'dictionary.delete',
            nodeId: write.nodeId,
            target: cloneTarget(write.target),
            key: write.key
          })

      const { owner, key } = ensureParentObjectForLeaf(draft, context, node, write.target)
      const dictionary = ensureObjectProperty(draft, owner, key)
      delete dictionary[write.key]
      return
    }

    case 'dictionary.replace': {
      inverse.push({
        kind: 'dictionary.replace',
        nodeId: write.nodeId,
        target: cloneTarget(write.target),
        value: cloneValue(
          (readNodeValue(context, draft.root, node, write.target) as Record<string, unknown> | undefined)
          ?? createMutableObject()
        )
      })

      const { owner, key } = ensureParentObjectForLeaf(draft, context, node, write.target)
      owner[key] = cloneValue(write.value)
      return
    }

    case 'sequence.insert':
    case 'sequence.move':
    case 'sequence.remove':
    case 'sequence.replace': {
      if (node.kind !== 'sequence') {
        throw new Error(`Write ${write.kind} requires a sequence node.`)
      }

      inverse.push({
        kind: 'sequence.replace',
        nodeId: write.nodeId,
        target: cloneTarget(write.target),
        value: cloneValue(
          (readNodeValue(context, draft.root, node, write.target) as readonly unknown[] | undefined)
          ?? []
        )
      })

      const { owner, key } = ensureParentObjectForLeaf(draft, context, node, write.target)
      const sequence = ensureArrayProperty(draft, owner, key)

      if (write.kind === 'sequence.replace') {
        owner[key] = cloneValue(write.value)
        return
      }

      const index = findSequenceIndex(node as CompiledMutationSequenceNode, sequence, write.value)

      if (write.kind === 'sequence.insert') {
        insertWithAnchor(sequence, cloneValue(write.value), write.anchor)
        return
      }

      if (index >= 0) {
        sequence.splice(index, 1)
      }

      if (write.kind === 'sequence.move') {
        insertWithAnchor(sequence, cloneValue(write.value), write.anchor)
      }
      return
    }

    case 'tree.insert':
    case 'tree.move':
    case 'tree.remove':
    case 'tree.patch':
    case 'tree.replace': {
      if (node.kind !== 'tree') {
        throw new Error(`Write ${write.kind} requires a tree node.`)
      }

      inverse.push({
        kind: 'tree.replace',
        nodeId: write.nodeId,
        target: cloneTarget(write.target),
        value: cloneValue(
          (readNodeValue(
            context,
            draft.root,
            node,
            write.target
          ) as import('../schema/constants').MutationTreeSnapshot<unknown> | undefined)
          ?? createMutableTree()
        )
      })

      const { owner, key } = ensureParentObjectForLeaf(draft, context, node, write.target)
      const tree = ensureTreeProperty(draft, owner, key)

      if (write.kind === 'tree.replace') {
        owner[key] = cloneValue(write.value)
        return
      }

      if (write.kind === 'tree.insert') {
        const treeNode = ensureTreeNode(draft, tree, write.treeNodeId)
        treeNode.value = cloneValue(write.value.value)
        treeNode.children = []
        draft.mutable.add(treeNode.children)
        removeTreeFromParent(draft, tree, write.treeNodeId)
        insertTreeIntoParent(draft, tree, write.treeNodeId, write.value.parentId, write.value.index)
        return
      }

      if (write.kind === 'tree.move') {
        removeTreeFromParent(draft, tree, write.treeNodeId)
        insertTreeIntoParent(draft, tree, write.treeNodeId, write.value.parentId, write.value.index)
        return
      }

      if (write.kind === 'tree.remove') {
        removeTreeSubtree(draft, tree, write.treeNodeId)
        return
      }

      const treeNode = ensureTreeNode(draft, tree, write.treeNodeId)
      const currentValue = isRecord(treeNode.value)
        ? ensureMutableObject(draft, treeNode.value)
        : createMutableObject()
      if (!draft.mutable.has(currentValue)) {
        draft.mutable.add(currentValue)
      }
      treeNode.value = currentValue
      Object.assign(currentValue, cloneValue(write.value))
      return
    }

    case 'entity.create': {
      if (node.kind !== 'table' && node.kind !== 'map') {
        throw new Error('entity.create requires a table or map node.')
      }

      inverse.push({
        kind: 'entity.remove',
        nodeId: write.nodeId,
        target: cloneTarget(write.target)!
      })

      if (node.kind === 'table') {
        const table = ensureCollectionValue(draft, context, node, write.target) as RuntimeTableValue
        table.byId[write.target.id] = cloneValue(write.value) as Record<string, unknown>
        insertIdWithAnchor(table.ids, write.target.id, write.anchor)
        return
      }

      const mapValue = ensureCollectionValue(draft, context, node, write.target) as RuntimeMapValue
      mapValue[write.target.id] = cloneValue(write.value) as Record<string, unknown>
      return
    }

    case 'entity.remove': {
      if (node.kind !== 'table' && node.kind !== 'map') {
        throw new Error('entity.remove requires a table or map node.')
      }

      const before = readEntityValue(context, draft.root, node, write.target)

      if (node.kind === 'table') {
        const beforeTable = readCollectionValue(context, draft.root, node, write.target) as RuntimeTableValue | undefined
        const anchor = beforeTable
          ? anchorForId(beforeTable.ids, write.target.id)
          : {
              at: 'start' as const
            }
        inverse.push({
          kind: 'entity.create',
          nodeId: write.nodeId,
          target: cloneTarget(write.target)!,
          value: cloneValue(before),
          anchor
        })

        const table = ensureCollectionValue(draft, context, node, write.target) as RuntimeTableValue
        delete table.byId[write.target.id]
        removeId(table.ids, write.target.id)
        return
      }

      inverse.push({
        kind: 'entity.create',
        nodeId: write.nodeId,
        target: cloneTarget(write.target)!,
        value: cloneValue(before)
      })

      const mapValue = ensureCollectionValue(draft, context, node, write.target) as RuntimeMapValue
      delete mapValue[write.target.id]
      return
    }

    case 'entity.move': {
      if (node.kind !== 'table') {
        throw new Error('entity.move requires a table node.')
      }

      const beforeTable = readCollectionValue(context, draft.root, node, write.target) as RuntimeTableValue | undefined
      inverse.push({
        kind: 'entity.move',
        nodeId: write.nodeId,
        target: cloneTarget(write.target)!,
        anchor: beforeTable
          ? anchorForId(beforeTable.ids, write.target.id)
          : {
              at: 'start'
            }
      })

      const table = ensureCollectionValue(draft, context, node, write.target) as RuntimeTableValue
      insertIdWithAnchor(table.ids, write.target.id, write.anchor)
      return
    }
  }
}

const createApplyContext = (
  compiled: CompiledMutationSchema
): MutationApplyContext => ({
  compiled,
  lineageCache: new Map<number, readonly CompiledMutationNode[]>()
})

export const applyMutationWrites = <TSchema extends MutationSchema>(
  schema: TSchema,
  document: MutationDocument<TSchema>,
  writes: readonly MutationWrite[]
): MutationApplyResult<TSchema> => {
  if (writes.length === 0) {
    return {
      document,
      inverse: []
    }
  }

  const context = createApplyContext(getCompiledMutationSchema(schema))
  const draft = createCowDraft(document)
  const inverse: MutationWrite[] = []

  for (const write of writes) {
    applyWrite(draft, context, inverse, write)
  }

  inverse.reverse()

  return {
    document: draft.root as MutationDocument<TSchema>,
    inverse
  }
}

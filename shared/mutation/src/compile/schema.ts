import {
  MUTATION_COMPILED_SCHEMA,
  MUTATION_OPTIONAL
} from '../schema/constants'
import type {
  MutationDictionaryNode,
  MutationFieldNode,
  MutationMapNode,
  MutationObjectNode,
  MutationSchema,
  MutationSequenceNode,
  MutationShape,
  MutationShapeNode,
  MutationSingletonNode,
  MutationTableNode,
  MutationTreeNode
} from '../schema/node'
import {
  isMutationGroup,
  isMutationNode
} from '../schema/node'

type CompiledNodeBase<
  TKind extends string,
  TSource extends MutationShapeNode | undefined = MutationShapeNode | undefined
> = {
  readonly nodeId: number
  readonly kind: TKind
  readonly key?: string
  readonly path: readonly string[]
  readonly parentNodeId?: number
  readonly ownerNodeId?: number
  readonly entityNodeId?: number
  readonly optional: boolean
  readonly source?: TSource
}

export type CompiledMutationObjectNode<TShape extends MutationShape = MutationShape> = CompiledNodeBase<
  'object',
  MutationObjectNode<TShape> | undefined
> & {
  readonly entries: {
    readonly [K in keyof TShape]: CompiledMutationNodeFor<TShape[K]>
  }
}

export type CompiledMutationFieldNode<TValue = unknown, TOptional extends boolean = boolean> = CompiledNodeBase<
  'field',
  MutationFieldNode<TValue, TOptional>
>

export type CompiledMutationDictionaryNode<TKey extends string = string, TValue = unknown> = CompiledNodeBase<
  'dictionary',
  MutationDictionaryNode<TKey, TValue>
>

export type CompiledMutationSequenceNode<TItem = unknown> = CompiledNodeBase<
  'sequence',
  MutationSequenceNode<TItem>
> & {
  readonly keyOf: (item: TItem) => string
}

export type CompiledMutationTreeNode<TNodeId extends string = string, TValue = unknown> = CompiledNodeBase<
  'tree',
  MutationTreeNode<TNodeId, TValue>
>

export type CompiledMutationSingletonNode<TShape extends MutationShape = MutationShape> = CompiledNodeBase<
  'singleton',
  MutationSingletonNode<TShape>
> & {
  readonly entity: CompiledMutationObjectNode<TShape>
}

export type CompiledMutationTableNode<TId extends string = string, TShape extends MutationShape = MutationShape> =
  CompiledNodeBase<'table', MutationTableNode<TId, TShape>> & {
    readonly entity: CompiledMutationObjectNode<TShape>
  }

export type CompiledMutationMapNode<TId extends string = string, TShape extends MutationShape = MutationShape> =
  CompiledNodeBase<'map', MutationMapNode<TId, TShape>> & {
    readonly entity: CompiledMutationObjectNode<TShape>
  }

export type CompiledMutationNode =
  | CompiledMutationObjectNode<MutationShape>
  | CompiledMutationFieldNode<unknown, boolean>
  | CompiledMutationDictionaryNode<string, unknown>
  | CompiledMutationSequenceNode<unknown>
  | CompiledMutationTreeNode<string, unknown>
  | CompiledMutationSingletonNode<MutationShape>
  | CompiledMutationTableNode<string, MutationShape>
  | CompiledMutationMapNode<string, MutationShape>

export type CompiledMutationNodeFor<TEntry> =
  TEntry extends MutationFieldNode<infer TValue, infer TOptional extends boolean>
    ? CompiledMutationFieldNode<TValue, TOptional>
  : TEntry extends MutationObjectNode<infer TShape>
    ? CompiledMutationObjectNode<TShape>
  : TEntry extends MutationDictionaryNode<infer TKey extends string, infer TValue>
    ? CompiledMutationDictionaryNode<TKey, TValue>
  : TEntry extends MutationSequenceNode<infer TItem>
    ? CompiledMutationSequenceNode<TItem>
  : TEntry extends MutationTreeNode<infer TNodeId extends string, infer TValue>
    ? CompiledMutationTreeNode<TNodeId, TValue>
  : TEntry extends MutationSingletonNode<infer TShape>
    ? CompiledMutationSingletonNode<TShape>
  : TEntry extends MutationTableNode<infer TId extends string, infer TShape>
    ? CompiledMutationTableNode<TId, TShape>
  : TEntry extends MutationMapNode<infer TId extends string, infer TShape>
    ? CompiledMutationMapNode<TId, TShape>
  : TEntry extends MutationShape
    ? CompiledMutationObjectNode<TEntry>
  : never

export type CompiledMutationSchema<TShape extends MutationShape = MutationShape> = {
  readonly root: CompiledMutationObjectNode<TShape>
  readonly nodes: readonly CompiledMutationNode[]
  readonly bySource: WeakMap<MutationShapeNode, CompiledMutationNode>
}

type CompileState = {
  nextNodeId: number
  nodes: CompiledMutationNode[]
  bySource: WeakMap<MutationShapeNode, CompiledMutationNode>
}

type CompileContext = {
  key?: string
  path: readonly string[]
  parentNodeId?: number
  ownerNodeId?: number
  entityNodeId?: number
  optional?: boolean
}

const isOptionalNode = (value: unknown): boolean => Boolean(
  value
  && typeof value === 'object'
  && (value as Record<PropertyKey, unknown>)[MUTATION_OPTIONAL] === true
)

const registerNode = <TNode extends CompiledMutationNode>(
  state: CompileState,
  node: TNode
): TNode => {
  state.nodes.push(node)
  if (node.source) {
    state.bySource.set(node.source, node)
  }
  return node
}

const compileObject = <TShape extends MutationShape>(
  shape: TShape,
  state: CompileState,
  context: CompileContext,
  source?: MutationObjectNode<TShape>
): CompiledMutationObjectNode<TShape> => {
  const objectNodeId = state.nextNodeId++
  const entries = {} as {
    [K in keyof TShape]: CompiledMutationNodeFor<TShape[K]>
  }
  const compiled = registerNode(state, {
    nodeId: objectNodeId,
    kind: 'object',
    key: context.key,
    path: context.path,
    parentNodeId: context.parentNodeId,
    ownerNodeId: context.ownerNodeId,
    entityNodeId: context.entityNodeId,
    optional: context.optional ?? false,
    source,
    entries
  } as CompiledMutationObjectNode<TShape>)

  const keys = Object.keys(shape) as (keyof TShape)[]

  for (const key of keys) {
    const entry = shape[key]
    const nextPath = [...context.path, String(key)]
    entries[key] = compileEntry(entry, state, {
      key: String(key),
      path: nextPath,
      parentNodeId: objectNodeId,
      ownerNodeId: objectNodeId,
      entityNodeId: context.entityNodeId,
      optional: isOptionalNode(entry)
    }) as CompiledMutationNodeFor<TShape[typeof key]>
  }

  return compiled
}

const compileEntry = (
  entry: MutationShapeNode | MutationShape,
  state: CompileState,
  context: CompileContext
): CompiledMutationNode => {
  if (isMutationGroup(entry)) {
    return compileObject(entry, state, context)
  }

  if (!isMutationNode(entry)) {
    throw new Error('Invalid mutation schema entry.')
  }

  switch (entry.kind) {
    case 'field':
      return registerNode(state, {
        nodeId: state.nextNodeId++,
        kind: 'field',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry
      } as CompiledMutationFieldNode<unknown, boolean>)

    case 'object':
      return compileObject(entry.shape, state, context, entry)

    case 'dictionary':
      return registerNode(state, {
        nodeId: state.nextNodeId++,
        kind: 'dictionary',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry
      } as CompiledMutationDictionaryNode<string, unknown>)

    case 'sequence':
      return registerNode(state, {
        nodeId: state.nextNodeId++,
        kind: 'sequence',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry,
        keyOf: entry.keyOf
      } as CompiledMutationSequenceNode<unknown>)

    case 'tree':
      return registerNode(state, {
        nodeId: state.nextNodeId++,
        kind: 'tree',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry
      } as CompiledMutationTreeNode<string, unknown>)

    case 'singleton': {
      const singletonNodeId = state.nextNodeId++
      const entity = compileObject(entry.shape, state, {
        path: context.path,
        parentNodeId: singletonNodeId,
        ownerNodeId: singletonNodeId,
        entityNodeId: singletonNodeId
      })
      return registerNode(state, {
        nodeId: singletonNodeId,
        kind: 'singleton',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry,
        entity
      } as CompiledMutationSingletonNode<MutationShape>)
    }

    case 'table': {
      const tableNodeId = state.nextNodeId++
      const entity = compileObject(entry.shape, state, {
        path: context.path,
        parentNodeId: tableNodeId,
        ownerNodeId: tableNodeId,
        entityNodeId: tableNodeId
      })
      return registerNode(state, {
        nodeId: tableNodeId,
        kind: 'table',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry,
        entity
      } as CompiledMutationTableNode<string, MutationShape>)
    }

    case 'map': {
      const mapNodeId = state.nextNodeId++
      const entity = compileObject(entry.shape, state, {
        path: context.path,
        parentNodeId: mapNodeId,
        ownerNodeId: mapNodeId,
        entityNodeId: mapNodeId
      })
      return registerNode(state, {
        nodeId: mapNodeId,
        kind: 'map',
        key: context.key,
        path: context.path,
        parentNodeId: context.parentNodeId,
        ownerNodeId: context.ownerNodeId,
        entityNodeId: context.entityNodeId,
        optional: context.optional ?? false,
        source: entry,
        entity
      } as CompiledMutationMapNode<string, MutationShape>)
    }
  }
}

export const compileMutationSchema = <TShape extends MutationShape>(
  shape: TShape
): CompiledMutationSchema<TShape> => {
  const state: CompileState = {
    nextNodeId: 0,
    nodes: [],
    bySource: new WeakMap<MutationShapeNode, CompiledMutationNode>()
  }

  return {
    root: compileObject(shape, state, {
      path: []
    }),
    nodes: [...state.nodes].sort((left, right) => left.nodeId - right.nodeId),
    bySource: state.bySource
  }
}

export const getCompiledMutationSchema = <TShape extends MutationShape>(
  schema: MutationSchema<TShape>
): CompiledMutationSchema<TShape> => schema[
  MUTATION_COMPILED_SCHEMA
] as CompiledMutationSchema<TShape>

export const getCompiledMutationNode = (
  schema: MutationSchema,
  node: MutationShapeNode
): CompiledMutationNode => {
  const compiled = getCompiledMutationSchema(schema)
  const entry = compiled.bySource.get(node)
  if (!entry) {
    throw new Error('Mutation schema node is not part of the compiled schema.')
  }
  return entry
}

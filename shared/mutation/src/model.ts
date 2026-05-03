import {
  unsetRecordWrite
} from '@shared/draft'
import {
  normalizeMutationDelta
} from './engine/delta'
import {
  compileEntities
} from './engine/entity'
import type {
  MutationProgramWriter
} from './engine/program/writer'
import type {
  CompiledEntitySpec,
  CompiledOrderedSpec,
  CompiledTreeSpec,
} from './engine/contracts'
import type {
  MutationDelta,
  MutationDeltaInput,
  MutationOrderedAnchor,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
} from './write'

type MemberPath = string

export type MutationValueMemberSpec<TValue = unknown> = {
  kind: 'field'
  at?: MemberPath
  __value?: TValue
}

export type MutationRecordMemberSpec<TValue = unknown> = {
  kind: 'record'
  at?: MemberPath
  __value?: TValue
}

export type MutationKeyedMemberSpec<TKey extends string = string, TValue = unknown> = {
  kind: 'keyed'
  at?: MemberPath
  __key?: TKey
  __value?: TValue
}

export type MutationMemberSpec =
  | MutationValueMemberSpec
  | MutationRecordMemberSpec
  | MutationKeyedMemberSpec

type FieldSelector = {
  kind: 'field'
  member: string
}

type RecordSelector = {
  kind: 'record'
  member: string
  mode: 'self' | 'deep'
}

type KeyedSelector = {
  kind: 'keyed'
  member: string
  mode: 'self' | 'deep'
}

export type MutationChangeSelector =
  | FieldSelector
  | RecordSelector
  | KeyedSelector

type SelectorApi<TMembers extends Readonly<Record<string, MutationMemberSpec>>> = {
  value<TKey extends keyof TMembers & string>(
    key: TMembers[TKey] extends MutationValueMemberSpec
      ? TKey
      : never
  ): FieldSelector
  object<TKey extends keyof TMembers & string>(
    key: TMembers[TKey] extends MutationRecordMemberSpec
      ? TKey
      : never
  ): {
    self(): RecordSelector
    deep(): RecordSelector
  }
  dictionary<TKey extends keyof TMembers & string>(
    key: TMembers[TKey] extends MutationKeyedMemberSpec
      ? TKey
      : never
  ): {
    self(): KeyedSelector
    deep(): KeyedSelector
  }
}

type MutationFamilyChanges<
  TMembers extends Readonly<Record<string, MutationMemberSpec>>
> = Readonly<Record<string, readonly MutationChangeSelector[]>> | ((
  api: SelectorApi<TMembers>
) => Readonly<Record<string, readonly MutationChangeSelector[]>>)

type OrderedShared<
  Doc,
  Item,
  Patch = unknown
> = {
  identify(item: Item): string
  clone?(item: Item): Item
  patch?(item: Item, patch: Patch): Item
  diff?(before: Item, after: Item): Patch
  emits: string
}

export type MutationOrderedFamilySpec<
  Doc,
  TFamilyKind extends 'singleton' | 'map' | 'table',
  Item = unknown,
  Key = string,
  Patch = unknown
> = OrderedShared<Doc, Item, Patch> & (
  TFamilyKind extends 'singleton'
    ? {
        read(document: Doc): readonly Item[]
        write(document: Doc, items: readonly Item[]): Doc
      }
    : {
        read(document: Doc, key: Key): readonly Item[]
        write(document: Doc, key: Key, items: readonly Item[]): Doc
      }
)

export type MutationTreeFamilySpec<
  Doc,
  TFamilyKind extends 'singleton' | 'map' | 'table',
  Value = unknown,
  Key = string,
  Patch = unknown
> = {
  clone?(value: Value): Value
  patch?(value: Value, patch: Patch): Value
  diff?(before: Value, after: Value): Patch
  emits: string
} & (
  TFamilyKind extends 'singleton'
    ? {
        read(document: Doc): MutationTreeSnapshot<Value>
        write(document: Doc, tree: MutationTreeSnapshot<Value>): Doc
      }
    : {
        read(document: Doc, key: Key): MutationTreeSnapshot<Value>
        write(document: Doc, key: Key, tree: MutationTreeSnapshot<Value>): Doc
      }
)

type SingletonFamilyAccess<
  Doc,
  Entity
> = {
  read(document: Doc): Entity
  write(document: Doc, next: Entity): Doc
  __entity?: Entity
}

type CollectionFamilyAccess<
  Doc,
  Id extends string,
  Entity
> = {
  read(document: Doc): Readonly<Record<Id, Entity | undefined>>
  write(document: Doc, next: Readonly<Record<Id, Entity | undefined>>): Doc
  __id?: Id
  __entity?: Entity
}

type BaseFamilySpec<
  Doc,
  Kind extends 'singleton' | 'map' | 'table',
  Id extends string | undefined,
  Entity,
  Members extends Readonly<Record<string, MutationMemberSpec>>,
  Changes extends Readonly<Record<string, readonly MutationChangeSelector[]>>,
  Ordered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, Kind, unknown, string>>> | undefined,
  Tree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, Kind, unknown, string>>> | undefined
> = {
  kind: Kind
  access: Kind extends 'singleton'
    ? SingletonFamilyAccess<Doc, Entity>
    : CollectionFamilyAccess<Doc, Extract<Id, string>, Entity>
  members: Members
  changes?: MutationFamilyChanges<Members>
  sequence?: Ordered
  tree?: Tree
  __id?: Id
  __entity?: Entity
  __changes?: Changes
}

export type MutationSingletonFamilySpec<
  Doc,
  Entity,
  Members extends Readonly<Record<string, MutationMemberSpec>>,
  Changes extends Readonly<Record<string, readonly MutationChangeSelector[]>>,
  Ordered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>>> | undefined,
  Tree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>>> | undefined
> = BaseFamilySpec<
  Doc,
  'singleton',
  undefined,
  Entity,
  Members,
  Changes,
  Ordered,
  Tree
>

export type MutationCollectionFamilySpec<
  Doc,
  Kind extends 'map' | 'table',
  Id extends string,
  Entity,
  Members extends Readonly<Record<string, MutationMemberSpec>>,
  Changes extends Readonly<Record<string, readonly MutationChangeSelector[]>>,
  Ordered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, Kind, unknown, string>>> | undefined,
  Tree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, Kind, unknown, string>>> | undefined
> = BaseFamilySpec<
  Doc,
  Kind,
  Id,
  Entity,
  Members,
  Changes,
  Ordered,
  Tree
>

export type MutationFamilySpec<
  Doc
> =
  | MutationSingletonFamilySpec<
      Doc,
      unknown,
      Readonly<Record<string, MutationMemberSpec>>,
      Readonly<Record<string, readonly MutationChangeSelector[]>>,
      any,
      any
    >
  | MutationCollectionFamilySpec<
      Doc,
      'map' | 'table',
      string,
      unknown,
      Readonly<Record<string, MutationMemberSpec>>,
      Readonly<Record<string, readonly MutationChangeSelector[]>>,
      any,
      any
    >

export type MutationGroupSpec<
  TChildren extends Readonly<Record<string, unknown>>
> = {
  kind: 'group'
  children: TChildren
  __children?: TChildren
}

type MutationModelEntry<
  Doc
> =
  | MutationFamilySpec<Doc>
  | MutationGroupSpec<MutationModelDefinition<Doc>>

export interface MutationModelDefinition<
  Doc
> extends Readonly<Record<string, MutationModelEntry<Doc>>> {}

export type MutationModel<Doc, TDefinition extends MutationModelDefinition<Doc> = MutationModelDefinition<Doc>> = TDefinition
export type MutationValueSpec<TValue = unknown> = MutationValueMemberSpec<TValue>
export type MutationObjectSpec<TValue = unknown> = MutationRecordMemberSpec<TValue>
export type MutationDictionarySpec<TKey extends string = string, TValue = unknown> = MutationKeyedMemberSpec<TKey, TValue>
export type MutationSequenceSpec<
  Doc,
  TFamilyKind extends 'singleton' | 'map' | 'table',
  Item = unknown,
  Key = string,
  Patch = unknown
> = MutationOrderedFamilySpec<Doc, TFamilyKind, Item, Key, Patch>
export type MutationTreeSpec<
  Doc,
  TFamilyKind extends 'singleton' | 'map' | 'table',
  Value = unknown,
  Key = string,
  Patch = unknown
> = MutationTreeFamilySpec<Doc, TFamilyKind, Value, Key, Patch>
export type MutationSingletonSpec<
  Doc,
  Entity,
  Members extends Readonly<Record<string, MutationMemberSpec>>,
  Changes extends Readonly<Record<string, readonly MutationChangeSelector[]>>,
  Ordered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>>> | undefined,
  Tree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>>> | undefined
> = MutationSingletonFamilySpec<Doc, Entity, Members, Changes, Ordered, Tree>
export type MutationCollectionSpec<
  Doc,
  Id extends string,
  Entity,
  Members extends Readonly<Record<string, MutationMemberSpec>>,
  Changes extends Readonly<Record<string, readonly MutationChangeSelector[]>>,
  Ordered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'map', unknown, string>>> | undefined,
  Tree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'map', unknown, string>>> | undefined
> = MutationCollectionFamilySpec<Doc, 'map', Id, Entity, Members, Changes, Ordered, Tree>
export type MutationNamespaceSpec<
  TChildren extends Readonly<Record<string, unknown>>
> = MutationGroupSpec<TChildren>
export interface MutationSchemaDefinition<
  Doc
> extends MutationModelDefinition<Doc> {}
export type MutationSchema<
  Doc,
  TDefinition extends MutationSchemaDefinition<Doc> = MutationSchemaDefinition<Doc>
> = TDefinition

type ShapeSequenceConfig<Item> = {
  emit?: string
  read?: (document: unknown, key?: string) => readonly Item[]
  write?: (document: unknown, key: string | undefined, items: readonly Item[]) => unknown
  identify?: (item: Item) => string
  clone?: (item: Item) => Item
  patch?: (item: Item, patch: unknown) => Item
  diff?: (before: Item, after: Item) => unknown
}

type ShapeTreeConfig<Value> = {
  emit?: string
  read?: (document: unknown, key?: string) => MutationTreeSnapshot<Value>
  write?: (document: unknown, key: string | undefined, treeValue: MutationTreeSnapshot<Value>) => unknown
  clone?: (value: Value) => Value
  patch?: (value: Value, patch: unknown) => Value
  diff?: (before: Value, after: Value) => unknown
}

export type ShapeSequenceNode<Item> = {
  readonly __shapeKind: 'sequence'
  readonly __sequence?: Item
  readonly __config?: ShapeSequenceConfig<Item>
  using(config: ShapeSequenceConfig<Item>): ShapeSequenceNode<Item>
}

type ShapeSequenceFactory<Item> = ShapeSequenceNode<Item> & (<
  Spec extends MutationOrderedFamilySpec<any, any, Item, string>
>(
  spec: Spec
) => Spec)

export type ShapeTreeNode<Value> = {
  readonly __shapeKind: 'tree'
  readonly __value?: Value
  readonly __config?: ShapeTreeConfig<Value>
  using(config: ShapeTreeConfig<Value>): ShapeTreeNode<Value>
}

type ShapeTreeFactory<Value> = ShapeTreeNode<Value> & (<
  Spec extends MutationTreeFamilySpec<any, any, Value, string>
>(
  spec: Spec
) => Spec)

type ShapeMemberNode =
  | MutationMemberSpec
  | ShapeSequenceNode<any>
  | ShapeTreeNode<any>

type ShapeFamilyShape = Readonly<Record<string, ShapeMemberNode>>

type ShapeFamilyFrom<
  Doc,
  Kind extends 'singleton' | 'map' | 'table',
  Id extends string,
  Entity
> = {
  path?: string
} | (
  Kind extends 'singleton'
    ? SingletonFamilyAccess<Doc, Entity>
    : CollectionFamilyAccess<Doc, Id, Entity>
)

type ShapeMemberSpecs<
  TShape extends ShapeFamilyShape
> = {
  [K in keyof TShape as TShape[K] extends MutationMemberSpec
    ? K
    : never]: Extract<TShape[K], MutationMemberSpec>
}

type ShapeSequenceSpecs<
  Doc,
  TKind extends 'singleton' | 'map' | 'table',
  TShape extends ShapeFamilyShape
> = {
  [K in keyof TShape as TShape[K] extends ShapeSequenceNode<any>
    ? K
    : never]: TShape[K] extends ShapeSequenceNode<infer TItem>
      ? MutationOrderedFamilySpec<Doc, TKind, TItem, string>
      : never
}

type ShapeTreeSpecs<
  Doc,
  TKind extends 'singleton' | 'map' | 'table',
  TShape extends ShapeFamilyShape
> = {
  [K in keyof TShape as TShape[K] extends ShapeTreeNode<any>
    ? K
    : never]: TShape[K] extends ShapeTreeNode<infer TValue>
      ? MutationTreeFamilySpec<Doc, TKind, TValue, string>
      : never
}

export type ShapeSingletonNode<
  Doc,
  Entity,
  TShape extends ShapeFamilyShape
> = {
  readonly __shapeKind: 'singleton'
  readonly shape: TShape
  readonly __entity?: Entity
  readonly __from?: ShapeFamilyFrom<Doc, 'singleton', never, Entity>
  readonly __changes?: MutationFamilyChanges<ShapeMemberSpecs<TShape>>
  from(input: ShapeFamilyFrom<Doc, 'singleton', never, Entity>): ShapeSingletonNode<Doc, Entity, TShape>
  changes(input: MutationFamilyChanges<ShapeMemberSpecs<TShape>>): ShapeSingletonNode<Doc, Entity, TShape>
}

export type ShapeCollectionNode<
  Doc,
  Kind extends 'map' | 'table',
  Id extends string,
  Entity,
  TShape extends ShapeFamilyShape
> = {
  readonly __shapeKind: Kind
  readonly shape: TShape
  readonly __id?: Id
  readonly __entity?: Entity
  readonly __from?: ShapeFamilyFrom<Doc, Kind, Id, Entity>
  readonly __changes?: MutationFamilyChanges<ShapeMemberSpecs<TShape>>
  from(input: ShapeFamilyFrom<Doc, Kind, Id, Entity>): ShapeCollectionNode<Doc, Kind, Id, Entity, TShape>
  changes(input: MutationFamilyChanges<ShapeMemberSpecs<TShape>>): ShapeCollectionNode<Doc, Kind, Id, Entity, TShape>
}

type ShapeFamilyNode<
  Doc
> =
  | ShapeSingletonNode<Doc, unknown, ShapeFamilyShape>
  | ShapeCollectionNode<Doc, 'map' | 'table', string, unknown, ShapeFamilyShape>

type ShapeDocumentMembers<
  TDefinition extends Readonly<Record<string, unknown>>
> = {
  [K in keyof TDefinition as TDefinition[K] extends MutationMemberSpec
    ? K
    : never]: Extract<TDefinition[K], MutationMemberSpec>
}

type ShapeDocumentSequences<
  Doc,
  TDefinition extends Readonly<Record<string, unknown>>
> = {
  [K in keyof TDefinition as TDefinition[K] extends ShapeSequenceNode<any>
    ? K
    : never]: TDefinition[K] extends ShapeSequenceNode<infer TItem>
      ? MutationOrderedFamilySpec<Doc, 'singleton', TItem, string>
      : never
}

type ShapeDocumentTrees<
  Doc,
  TDefinition extends Readonly<Record<string, unknown>>
> = {
  [K in keyof TDefinition as TDefinition[K] extends ShapeTreeNode<any>
    ? K
    : never]: TDefinition[K] extends ShapeTreeNode<infer TValue>
      ? MutationTreeFamilySpec<Doc, 'singleton', TValue, string>
      : never
}

type HasShapeDocumentFamily<
  Doc,
  TDefinition extends Readonly<Record<string, unknown>>
> = [
  keyof ShapeDocumentMembers<TDefinition>
  | keyof ShapeDocumentSequences<Doc, TDefinition>
  | keyof ShapeDocumentTrees<Doc, TDefinition>
] extends [never]
  ? false
  : true

type LowerShapeFamilyNode<
  Doc,
  TNode
> = TNode extends ShapeSingletonNode<Doc, infer Entity, infer TShape extends ShapeFamilyShape>
  ? MutationSingletonFamilySpec<
      Doc,
      Entity,
      ShapeMemberSpecs<TShape>,
      Readonly<Record<string, readonly MutationChangeSelector[]>>,
      ShapeSequenceSpecs<Doc, 'singleton', TShape>,
      ShapeTreeSpecs<Doc, 'singleton', TShape>
    >
  : TNode extends ShapeCollectionNode<Doc, infer Kind extends 'map' | 'table', infer Id extends string, infer Entity, infer TShape extends ShapeFamilyShape>
    ? MutationCollectionFamilySpec<
        Doc,
        Kind,
        Id,
        Entity,
        ShapeMemberSpecs<TShape>,
        Readonly<Record<string, readonly MutationChangeSelector[]>>,
        ShapeSequenceSpecs<Doc, Kind, TShape>,
        ShapeTreeSpecs<Doc, Kind, TShape>
      >
    : never

type LowerShapeDefinition<
  Doc,
  TDefinition extends Readonly<Record<string, unknown>>,
  TRoot extends boolean = true
> = (
  TRoot extends true
    ? HasShapeDocumentFamily<Doc, TDefinition> extends true
      ? {
          document: MutationSingletonFamilySpec<
            Doc,
            Doc,
            ShapeDocumentMembers<TDefinition>,
            Readonly<Record<string, readonly MutationChangeSelector[]>>,
            ShapeDocumentSequences<Doc, TDefinition>,
            ShapeDocumentTrees<Doc, TDefinition>
          >
        }
      : {}
    : {}
) & {
  [K in keyof TDefinition as TDefinition[K] extends ShapeFamilyNode<Doc>
    ? K
    : TDefinition[K] extends MutationMemberSpec | ShapeSequenceNode<any> | ShapeTreeNode<any>
      ? never
      : TDefinition[K] extends Readonly<Record<string, unknown>>
        ? K
        : never]: TDefinition[K] extends ShapeFamilyNode<Doc>
          ? LowerShapeFamilyNode<Doc, TDefinition[K]>
          : TDefinition[K] extends Readonly<Record<string, unknown>>
            ? MutationGroupSpec<LowerShapeDefinition<Doc, TDefinition[K], false>>
            : never
}

export const defineMutationSchema = <
  Doc
>() => <
  const TDefinition extends MutationSchemaDefinition<Doc>
>(
  definition: TDefinition
): TDefinition => definition

const SHAPE_NODE_BRAND = '__shapeKind'

const createShapeSequenceNode = <Item,>(
  config: ShapeSequenceConfig<Item> = {}
): ShapeSequenceFactory<Item> => {
  const node = ((spec: MutationOrderedFamilySpec<any, any, Item, string>) => spec) as ShapeSequenceFactory<Item>
  ;(node as unknown as Record<string, unknown>)[SHAPE_NODE_BRAND] = 'sequence'
  ;(node as unknown as Record<string, unknown>).__config = config
  node.using = (nextConfig) => createShapeSequenceNode({
    ...config,
    ...nextConfig
  })
  return node
}

const createShapeTreeNode = <Value,>(
  config: ShapeTreeConfig<Value> = {}
): ShapeTreeFactory<Value> => {
  const node = ((spec: MutationTreeFamilySpec<any, any, Value, string>) => spec) as ShapeTreeFactory<Value>
  ;(node as unknown as Record<string, unknown>)[SHAPE_NODE_BRAND] = 'tree'
  ;(node as unknown as Record<string, unknown>).__config = config
  node.using = (nextConfig) => createShapeTreeNode({
    ...config,
    ...nextConfig
  })
  return node
}

const createShapeFamilyNode = <
  Doc,
  Kind extends 'singleton' | 'map' | 'table',
  Id extends string,
  Entity,
  const TShape extends ShapeFamilyShape
>(
  kind: Kind,
  shape: TShape
): ShapeSingletonNode<Doc, Entity, TShape> | ShapeCollectionNode<Doc, Extract<Kind, 'map' | 'table'>, Id, Entity, TShape> => {
  const node = {
    __shapeKind: kind,
    shape,
    from(input: ShapeFamilyFrom<Doc, Kind, Id, Entity>) {
      ;(this as Record<string, unknown>).__from = input
      return this
    },
    changes(input: MutationFamilyChanges<ShapeMemberSpecs<TShape>>) {
      ;(this as Record<string, unknown>).__changes = input
      return this
    }
  } as ShapeSingletonNode<Doc, Entity, TShape> | ShapeCollectionNode<Doc, Extract<Kind, 'map' | 'table'>, Id, Entity, TShape>

  return node
}

const isShapeSequenceNode = (
  value: unknown
): value is ShapeSequenceNode<unknown> => (
  typeof value === 'function'
  && (value as unknown as Record<string, unknown>)[SHAPE_NODE_BRAND] === 'sequence'
)

const isShapeTreeNode = (
  value: unknown
): value is ShapeTreeNode<unknown> => (
  typeof value === 'function'
  && (value as unknown as Record<string, unknown>)[SHAPE_NODE_BRAND] === 'tree'
)

const isShapeFamilyNode = <Doc,>(
  value: unknown
): value is ShapeFamilyNode<Doc> => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && (
    (value as Record<string, unknown>)[SHAPE_NODE_BRAND] === 'singleton'
    || (value as Record<string, unknown>)[SHAPE_NODE_BRAND] === 'map'
    || (value as Record<string, unknown>)[SHAPE_NODE_BRAND] === 'table'
  )
)

const isMutationMemberNode = (
  value: unknown
): value is MutationMemberSpec => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && (
    (value as {
      kind?: unknown
    }).kind === 'field'
    || (value as {
      kind?: unknown
    }).kind === 'record'
    || (value as {
      kind?: unknown
    }).kind === 'keyed'
  )
)

type ShapeSchemaOptions<
  Doc,
  TDefinition extends Readonly<Record<string, unknown>>
> = {
  changes?: MutationFamilyChanges<ShapeDocumentMembers<TDefinition>>
}

const readObjectPath = (
  value: unknown,
  path: readonly string[]
): unknown => {
  let current = value
  for (let index = 0; index < path.length; index += 1) {
    if (
      typeof current !== 'object'
      || current === null
      || Array.isArray(current)
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[path[index]!]
  }
  return current
}

const writeObjectPath = (
  value: unknown,
  path: readonly string[],
  next: unknown
): unknown => {
  if (path.length === 0) {
    return next
  }

  const [head, ...rest] = path
  const current = (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : {}

  return {
    ...current,
    [head!]: writeObjectPath(
      current[head!],
      rest,
      next
    )
  }
}

const appendMissingIds = <TId extends string>(
  previous: readonly TId[],
  nextById: Readonly<Record<string, unknown>>
): TId[] => {
  const nextIds = previous.filter((id) => nextById[id] !== undefined)
  const seen = new Set(nextIds)

  Object.keys(nextById).forEach((id) => {
    if (seen.has(id as TId)) {
      return
    }

    nextIds.push(id as TId)
    seen.add(id as TId)
  })

  return nextIds
}

const createDefaultFamilyChanges = (
  members: Readonly<Record<string, MutationMemberSpec>>
): Readonly<Record<string, readonly MutationChangeSelector[]>> => Object.fromEntries(
  Object.entries(members).map(([name, member]) => [
    name,
    [member.kind === 'field'
      ? {
          kind: 'field',
          member: name
        } satisfies FieldSelector
      : member.kind === 'record'
        ? {
            kind: 'record',
            member: name,
            mode: 'deep'
          } satisfies RecordSelector
        : {
            kind: 'keyed',
            member: name,
            mode: 'deep'
          } satisfies KeyedSelector]
  ])
)

const readDefaultOrderedId = (
  value: unknown
): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value)
  }
  if (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof (value as {
      id?: unknown
    }).id === 'string'
    && (value as {
      id: string
    }).id.length > 0
  ) {
    return (value as {
      id: string
    }).id
  }

  throw new Error('Mutation sequence item requires either a primitive id value or an object with string id.')
}

export const namespace = <
  const TChildren extends MutationModelDefinition<any>
>(
  children: TChildren
): MutationGroupSpec<TChildren> => ({
  kind: 'group',
  children
})

export const value = <TValue,>(
  input: {
    at?: string
  } = {}
): MutationValueMemberSpec<TValue> => ({
  kind: 'field',
  ...(input.at === undefined ? {} : { at: input.at })
})

export const object = <TValue,>(
  input: {
    at?: string
  } = {}
): MutationRecordMemberSpec<TValue> => ({
  kind: 'record',
  ...(input.at === undefined ? {} : { at: input.at })
})

export const dictionary = <TKey extends string, TValue>(
  input: {
    at?: string
  } = {}
): MutationKeyedMemberSpec<TKey, TValue> => ({
  kind: 'keyed',
  ...(input.at === undefined ? {} : { at: input.at })
})

export const field = value

export function singleton<Doc, Entity>(): <
  const TMembers extends Readonly<Record<string, MutationMemberSpec>>,
  const TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>>> | undefined = undefined,
  const TTree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>>> | undefined = undefined,
  const TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>> = Readonly<Record<string, readonly MutationChangeSelector[]>>
>(
  input: {
    access: SingletonFamilyAccess<Doc, Entity>
    members: TMembers
    changes?: MutationFamilyChanges<TMembers>
    sequence?: TOrdered
    tree?: TTree
  }
) => MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree>
export function singleton<
  Doc,
  Entity,
  const TShape extends ShapeFamilyShape
>(
  shape: TShape
): ShapeSingletonNode<Doc, Entity, TShape>
export function singleton(...args: unknown[]) {
  if (args.length === 0) {
    return <
      Doc,
      Entity,
      const TMembers extends Readonly<Record<string, MutationMemberSpec>>,
      const TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>>> | undefined = undefined,
      const TTree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>>> | undefined = undefined,
      const TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>> = Readonly<Record<string, readonly MutationChangeSelector[]>>
    >(input: {
      access: SingletonFamilyAccess<Doc, Entity>
      members: TMembers
      changes?: MutationFamilyChanges<TMembers>
      sequence?: TOrdered
      tree?: TTree
    }): MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree> => ({
      kind: 'singleton',
      ...input
    }) as MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree>
  }

  return createShapeFamilyNode('singleton', args[0] as ShapeFamilyShape)
}

export const collection = <Doc, Id extends string, Entity>() => <
  const TMembers extends Readonly<Record<string, MutationMemberSpec>>,
  const TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'map', unknown, string>>> | undefined = undefined,
  const TTree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'map', unknown, string>>> | undefined = undefined,
  const TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>> = Readonly<Record<string, readonly MutationChangeSelector[]>>
>(
  input: {
    access: CollectionFamilyAccess<Doc, Id, Entity>
    members: TMembers
    changes?: MutationFamilyChanges<TMembers>
    sequence?: TOrdered
    tree?: TTree
  }
): MutationCollectionFamilySpec<Doc, 'map', Id, Entity, TMembers, TChanges, TOrdered, TTree> => ({
  kind: 'map',
  ...input
}) as MutationCollectionFamilySpec<Doc, 'map', Id, Entity, TMembers, TChanges, TOrdered, TTree>
export const map = <
  Doc,
  Id extends string,
  Entity,
  const TShape extends ShapeFamilyShape
>(
  shape: TShape
): ShapeCollectionNode<Doc, 'map', Id, Entity, TShape> => createShapeFamilyNode(
  'map',
  shape
) as ShapeCollectionNode<Doc, 'map', Id, Entity, TShape>

export const table = <
  Doc,
  Id extends string,
  Entity,
  const TShape extends ShapeFamilyShape
>(
  shape: TShape
): ShapeCollectionNode<Doc, 'table', Id, Entity, TShape> => createShapeFamilyNode(
  'table',
  shape
) as ShapeCollectionNode<Doc, 'table', Id, Entity, TShape>

export const sequence = <
  Item
>() => createShapeSequenceNode<Item>()

export const tree = <
  Value
>() => createShapeTreeNode<Value>()

const readFamilyPath = (
  familyName: string,
  input: {
    path?: string
  } | undefined
): readonly string[] => (
  input?.path?.split('.').filter(Boolean)
  ?? familyName.split('.').filter(Boolean)
)

const lowerShapeSequenceSpec = <Doc>(
  familyAccess: SingletonFamilyAccess<Doc, unknown> | CollectionFamilyAccess<Doc, string, unknown>,
  familyKind: 'singleton' | 'map' | 'table',
  familyName: string,
  structureName: string,
  node: ShapeSequenceNode<unknown>
): MutationOrderedFamilySpec<Doc, any, unknown, string> => {
  const config = node.__config ?? {}
  const readMember = (entity: unknown) => {
    const value = (
      typeof entity === 'object'
      && entity !== null
      && !Array.isArray(entity)
    )
      ? (entity as Record<string, unknown>)[structureName]
      : undefined

    if (Array.isArray(value)) {
      return value
    }

    return []
  }

  const writeMember = (entity: unknown, items: readonly unknown[]) => ({
    ...(typeof entity === 'object' && entity !== null && !Array.isArray(entity)
      ? entity as Record<string, unknown>
      : {}),
    [structureName]: items
  })

  return {
    read: config.read
      ? ((document: Doc, key?: string) => config.read!(document, key))
      : familyKind === 'singleton'
        ? ((document: Doc) => readMember(
            (familyAccess as SingletonFamilyAccess<Doc, unknown>).read(document)
          ))
        : ((document: Doc, key: string) => {
            const entity = (familyAccess as CollectionFamilyAccess<Doc, string, unknown>).read(document)[key]
            if (entity === undefined) {
              throw new Error(`Mutation sequence "${familyName}.${structureName}" cannot find host entity "${key}".`)
            }
            return readMember(entity)
          }),
    write: config.write
      ? ((document: Doc, key: string | undefined, items: readonly unknown[]) => config.write!(document, key, items) as Doc)
      : familyKind === 'singleton'
        ? ((document: Doc, items: readonly unknown[]) => (familyAccess as SingletonFamilyAccess<Doc, unknown>).write(
            document,
            writeMember((familyAccess as SingletonFamilyAccess<Doc, unknown>).read(document), items)
          ))
        : ((document: Doc, key: string, items: readonly unknown[]) => {
            const access = familyAccess as CollectionFamilyAccess<Doc, string, unknown>
            const collection = access.read(document)
            const entity = collection[key]
            if (entity === undefined) {
              throw new Error(`Mutation sequence "${familyName}.${structureName}" cannot find host entity "${key}".`)
            }
            return access.write(document, {
              ...collection,
              [key]: writeMember(entity, items)
            })
          }),
    identify: config.identify ?? readDefaultOrderedId,
    emits: config.emit ?? structureName,
    ...(config.clone === undefined ? {} : { clone: config.clone }),
    ...(config.patch === undefined ? {} : { patch: config.patch }),
    ...(config.diff === undefined ? {} : { diff: config.diff }),
  } as unknown as MutationOrderedFamilySpec<Doc, any, unknown, string>
}

const lowerShapeTreeSpec = <Doc>(
  familyAccess: SingletonFamilyAccess<Doc, unknown> | CollectionFamilyAccess<Doc, string, unknown>,
  familyKind: 'singleton' | 'map' | 'table',
  familyName: string,
  structureName: string,
  node: ShapeTreeNode<unknown>
): MutationTreeFamilySpec<Doc, any, unknown, string> => {
  const config = node.__config ?? {}
  const readMember = (entity: unknown) => {
    const value = (
      typeof entity === 'object'
      && entity !== null
      && !Array.isArray(entity)
    )
      ? (entity as Record<string, unknown>)[structureName]
      : undefined

    if (
      typeof value !== 'object'
      || value === null
      || !('rootIds' in value)
      || !('nodes' in value)
    ) {
      throw new Error(`Mutation tree "${familyName}.${structureName}" must resolve to a tree snapshot.`)
    }

    return value as MutationTreeSnapshot
  }

  const writeMember = (entity: unknown, treeValue: MutationTreeSnapshot<unknown>) => ({
    ...(typeof entity === 'object' && entity !== null && !Array.isArray(entity)
      ? entity as Record<string, unknown>
      : {}),
    [structureName]: treeValue
  })

  return {
    read: config.read
      ? ((document: Doc, key?: string) => config.read!(document, key))
      : familyKind === 'singleton'
        ? ((document: Doc) => readMember(
            (familyAccess as SingletonFamilyAccess<Doc, unknown>).read(document)
          ))
        : ((document: Doc, key: string) => {
            const entity = (familyAccess as CollectionFamilyAccess<Doc, string, unknown>).read(document)[key]
            if (entity === undefined) {
              throw new Error(`Mutation tree "${familyName}.${structureName}" cannot find host entity "${key}".`)
            }
            return readMember(entity)
          }),
    write: config.write
      ? ((document: Doc, key: string | undefined, treeValue: MutationTreeSnapshot<unknown>) => config.write!(document, key, treeValue) as Doc)
      : familyKind === 'singleton'
        ? ((document: Doc, treeValue: MutationTreeSnapshot<unknown>) => (familyAccess as SingletonFamilyAccess<Doc, unknown>).write(
            document,
            writeMember((familyAccess as SingletonFamilyAccess<Doc, unknown>).read(document), treeValue)
          ))
        : ((document: Doc, key: string, treeValue: MutationTreeSnapshot<unknown>) => {
            const access = familyAccess as CollectionFamilyAccess<Doc, string, unknown>
            const collection = access.read(document)
            const entity = collection[key]
            if (entity === undefined) {
              throw new Error(`Mutation tree "${familyName}.${structureName}" cannot find host entity "${key}".`)
            }
            return access.write(document, {
              ...collection,
              [key]: writeMember(entity, treeValue)
            })
          }),
    emits: config.emit ?? structureName,
    ...(config.clone === undefined ? {} : { clone: config.clone }),
    ...(config.patch === undefined ? {} : { patch: config.patch }),
    ...(config.diff === undefined ? {} : { diff: config.diff }),
  } as unknown as MutationTreeFamilySpec<Doc, any, unknown, string>
}

const lowerShapeFamily = <Doc>(
  familyName: string,
  family: ShapeFamilyNode<Doc>
): MutationFamilySpec<Doc> => {
  const members: Record<string, MutationMemberSpec> = {}
  const ordered: Record<string, MutationOrderedFamilySpec<Doc, any, unknown, string>> = {}
  const treeSpecs: Record<string, MutationTreeFamilySpec<Doc, any, unknown, string>> = {}

  Object.entries(family.shape).forEach(([name, entry]) => {
    if (isMutationMemberNode(entry)) {
      members[name] = entry
      return
    }
    if (isShapeSequenceNode(entry)) {
      return
    }
    if (isShapeTreeNode(entry)) {
      return
    }
    throw new Error(`Unknown shape member "${familyName}.${name}".`)
  })

  const path = readFamilyPath(familyName, family.__from as {
    path?: string
  } | undefined)
  const isCustomAccess = Boolean(
    family.__from
    && typeof family.__from === 'object'
    && 'read' in family.__from
    && 'write' in family.__from
  )

  const access = isCustomAccess
    ? family.__from as SingletonFamilyAccess<Doc, unknown> | CollectionFamilyAccess<Doc, string, unknown>
    : family.__shapeKind === 'singleton'
      ? {
          read: (document: Doc) => (
            path.length === 0
              ? document
              : readObjectPath(document, path)
          ),
          write: (document: Doc, next: unknown) => (
            path.length === 0
              ? next as Doc
              : writeObjectPath(document, path, next) as Doc
          )
        } satisfies SingletonFamilyAccess<Doc, unknown>
      : family.__shapeKind === 'table'
        ? {
            read: (document: Doc) => {
              const tableValue = readObjectPath(document, path) as {
                byId?: Readonly<Record<string, unknown>>
              } | undefined
              return tableValue?.byId ?? {}
            },
            write: (document: Doc, next: Readonly<Record<string, unknown>>) => {
              const tableValue = readObjectPath(document, path) as {
                ids?: readonly string[]
                byId?: Readonly<Record<string, unknown>>
              } | undefined
              return writeObjectPath(document, path, {
                ...(typeof tableValue === 'object' && tableValue !== null ? tableValue : {}),
                byId: next,
                ids: appendMissingIds(
                  (tableValue?.ids ?? []) as readonly string[],
                  next
                )
              }) as Doc
            }
          } satisfies CollectionFamilyAccess<Doc, string, unknown>
        : {
            read: (document: Doc) => (readObjectPath(document, path) as Readonly<Record<string, unknown>>) ?? {},
            write: (document: Doc, next: Readonly<Record<string, unknown>>) => writeObjectPath(document, path, next) as Doc
          } satisfies CollectionFamilyAccess<Doc, string, unknown>

  Object.entries(family.shape).forEach(([name, entry]) => {
    if (isShapeSequenceNode(entry)) {
      ordered[name] = lowerShapeSequenceSpec(
        access,
        family.__shapeKind,
        familyName,
        name,
        entry
      )
      return
    }
    if (isShapeTreeNode(entry)) {
      treeSpecs[name] = lowerShapeTreeSpec(
        access,
        family.__shapeKind,
        familyName,
        name,
        entry
      )
    }
  })

  const changes = family.__changes ?? createDefaultFamilyChanges(members)

  return family.__shapeKind === 'singleton'
    ? {
        kind: 'singleton',
        access: access as SingletonFamilyAccess<Doc, unknown>,
        members,
        changes,
        ...(Object.keys(ordered).length === 0 ? {} : { sequence: ordered }),
        ...(Object.keys(treeSpecs).length === 0 ? {} : { tree: treeSpecs }),
      }
    : {
        kind: family.__shapeKind,
        access: access as CollectionFamilyAccess<Doc, string, unknown>,
        members,
        changes,
        ...(Object.keys(ordered).length === 0 ? {} : { sequence: ordered }),
        ...(Object.keys(treeSpecs).length === 0 ? {} : { tree: treeSpecs }),
      }
}

const lowerShapeGroup = <Doc>(
  definition: Readonly<Record<string, unknown>>,
  options?: ShapeSchemaOptions<Doc, Readonly<Record<string, unknown>>>,
  root = true,
  prefix = ''
): MutationModelDefinition<Doc> => {
  const lowered: Record<string, unknown> = {}
  const documentMembers: Record<string, MutationMemberSpec> = {}
  const documentOrdered: Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>> = {}
  const documentTree: Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>> = {}

  Object.entries(definition).forEach(([name, entry]) => {
    const familyName = prefix
      ? `${prefix}.${name}`
      : name

    if (isMutationMemberNode(entry)) {
      if (!root) {
        throw new Error(`Nested schema group "${name}" cannot contain direct field members.`)
      }
      documentMembers[name] = entry
      return
    }

    if (isShapeSequenceNode(entry)) {
      if (!root) {
        throw new Error(`Nested schema group "${name}" cannot contain direct sequence members.`)
      }
      documentOrdered[name] = lowerShapeSequenceSpec(
        {
          read: (document: Doc) => document,
          write: (_document: Doc, next: unknown) => next as Doc
        },
        'singleton',
        'document',
        name,
        entry
      ) as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>
      return
    }

    if (isShapeTreeNode(entry)) {
      if (!root) {
        throw new Error(`Nested schema group "${name}" cannot contain direct tree members.`)
      }
      documentTree[name] = lowerShapeTreeSpec(
        {
          read: (document: Doc) => document,
          write: (_document: Doc, next: unknown) => next as Doc
        },
        'singleton',
        'document',
        name,
        entry
      ) as MutationTreeFamilySpec<Doc, 'singleton', unknown, string>
      return
    }

    if (isShapeFamilyNode<Doc>(entry)) {
      lowered[name] = lowerShapeFamily(familyName, entry)
      return
    }

    if (
      entry
      && typeof entry === 'object'
      && !Array.isArray(entry)
    ) {
      lowered[name] = namespace(
        lowerShapeGroup(
          entry as Readonly<Record<string, unknown>>,
          undefined,
          false,
          familyName
        )
      )
      return
    }

    throw new Error(`Unknown schema entry "${name}".`)
  })

  if (
    root
    && (
      Object.keys(documentMembers).length > 0
      || Object.keys(documentOrdered).length > 0
      || Object.keys(documentTree).length > 0
    )
  ) {
    lowered.document = {
      kind: 'singleton',
      access: {
        read: (document: Doc) => document,
        write: (_document: Doc, next: Doc) => next
      },
      members: documentMembers,
      changes: options?.changes ?? createDefaultFamilyChanges(documentMembers),
      ...(Object.keys(documentOrdered).length === 0 ? {} : { sequence: documentOrdered }),
      ...(Object.keys(documentTree).length === 0 ? {} : { tree: documentTree }),
    } satisfies MutationSingletonFamilySpec<
      Doc,
      Doc,
      Readonly<Record<string, MutationMemberSpec>>,
      Readonly<Record<string, readonly MutationChangeSelector[]>>,
      Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>>>,
      Readonly<Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>>>
    >
  }

  return lowered as MutationModelDefinition<Doc>
}

export const schema = <
  Doc,
  const TDefinition extends Readonly<Record<string, unknown>>
>(
  definition: TDefinition,
  options?: ShapeSchemaOptions<Doc, TDefinition>
): LowerShapeDefinition<Doc, TDefinition> => lowerShapeGroup(
  definition,
  options as ShapeSchemaOptions<Doc, Readonly<Record<string, unknown>>> | undefined,
  true
) as LowerShapeDefinition<Doc, TDefinition>

type FamilyEntity<
  TFamily
> = TFamily extends {
  __entity?: infer TEntity
}
  ? TEntity
  : never

type FamilyId<
  TFamily
> = TFamily extends {
  __id?: infer TId
}
  ? TId
  : never

type FamilyChangesOf<
  TFamily
> = TFamily extends {
  __changes?: infer TChanges
}
  ? TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>>
    ? TChanges
    : never
  : never

type FamilyMembersOf<
  TFamily
> = TFamily extends {
  members: infer TMembers
}
  ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
    ? TMembers
    : never
  : never

type KeyedMemberKey<
  TMember
> = TMember extends MutationKeyedMemberSpec<infer TKey, unknown>
  ? TKey
  : never

type KeyedMemberValue<
  TMember
> = TMember extends MutationKeyedMemberSpec<string, infer TValue>
  ? TValue
  : never

type FamilySequenceOf<
  TFamily
> = TFamily extends {
  sequence?: infer TOrdered
}
  ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
    ? TOrdered
    : never
  : never

type FamilyTreeOf<
  TFamily
> = TFamily extends {
  tree?: infer TTree
}
  ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
    ? TTree
    : never
  : never

type IsAny<T> = 0 extends (1 & T)
  ? true
  : false

type FamilySequenceNames<
  TFamily
> = TFamily extends {
  sequence?: infer TOrdered
}
  ? IsAny<TOrdered> extends true
    ? never
    : TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
      ? keyof TOrdered
      : never
  : never

type FamilyTreeNames<
  TFamily
> = TFamily extends {
  tree?: infer TTree
}
  ? IsAny<TTree> extends true
    ? never
    : TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
      ? keyof TTree
      : never
  : never

type FamilyStructureNames<
  TFamily
> = FamilySequenceNames<TFamily> | FamilyTreeNames<TFamily>

type PatchValueFromMember<
  TMember
> = TMember extends MutationValueMemberSpec<infer TValue>
  ? TValue
  : TMember extends MutationRecordMemberSpec<infer TValue>
    ? Partial<TValue>
    : TMember extends MutationKeyedMemberSpec<infer TKey, infer TValue>
      ? Readonly<Partial<Record<TKey, TValue | undefined>>>
    : never

type MutationPatchOfMembers<
  TMembers extends Readonly<Record<string, MutationMemberSpec>>
> = Partial<{
  [K in keyof TMembers]: PatchValueFromMember<TMembers[K]>
}>

type MemberValueFromSpec<
  TMember
> = TMember extends MutationValueMemberSpec<infer TValue>
  ? TValue
  : TMember extends MutationRecordMemberSpec<infer TValue>
    ? TValue
    : TMember extends MutationKeyedMemberSpec<infer TKey, infer TValue>
      ? Readonly<Record<TKey, TValue | undefined>>
      : never

type SequenceIdOf<
  TItem
> = TItem extends string
  ? TItem
  : string

type SequenceTarget<
  TItem
> = TItem | SequenceIdOf<TItem>

export type MutationSequenceAnchor =
  | MutationOrderedAnchor
  | {
      before?: string
      after?: string
    }

type MutationTreeLocation<
  TValue
> = {
  parentId?: string
  index?: number
  value?: TValue
}

type KeyedWriterApi<
  TKey extends string,
  TValue
> = {
  set(
    key: TKey,
    value: TValue
  ): void
  delete(
    key: TKey
  ): void
  remove(
    key: TKey
  ): void
}

type OrderedWriterApi<
  TItem
> = {
  insert(
    value: TItem,
    to?: MutationSequenceAnchor
  ): void
  move(
    item: SequenceTarget<TItem>,
    to?: MutationSequenceAnchor
  ): void
  splice(
    itemIds: readonly string[],
    to?: MutationSequenceAnchor
  ): void
  patch(
    item: SequenceTarget<TItem>,
    patch: unknown
  ): void
  delete(
    item: SequenceTarget<TItem>
  ): void
  remove(
    item: SequenceTarget<TItem>
  ): void
  replace(
    items: readonly TItem[]
  ): void
}

type TreeWriterApi<
  TValue
> = {
  insert(
    nodeId: string,
    location?: MutationTreeLocation<TValue>
  ): void
  move(
    nodeId: string,
    location?: Omit<MutationTreeLocation<TValue>, 'value'>
  ): void
  delete(
    nodeId: string
  ): void
  remove(
    nodeId: string
  ): void
  patch(
    nodeId: string,
    patch: unknown
  ): void
}

type KeyedReaderApi<TKey extends string, TValue> = {
  get(key: TKey): TValue | undefined
  has(key: TKey): boolean
  keys(): readonly TKey[]
  entries(): readonly (readonly [TKey, TValue])[]
}

type MutationSequenceSlot<
  TItem
> = {
  prev?: TItem
  next?: TItem
}

type OrderedReaderApi<
  TItem
> = {
  items(): readonly TItem[]
  ids(): readonly SequenceIdOf<TItem>[]
  contains(item: SequenceTarget<TItem>): boolean
  indexOf(item: SequenceTarget<TItem>): number
  before(item: SequenceTarget<TItem>): TItem | undefined
  after(item: SequenceTarget<TItem>): TItem | undefined
  slot(item: SequenceTarget<TItem>): MutationSequenceSlot<TItem> | undefined
}

type TreeReaderApi<
  TValue
> = {
  snapshot(): MutationTreeSnapshot<TValue>
  has(nodeId: string): boolean
  node(nodeId: string): MutationTreeNodeSnapshot<TValue> | undefined
  value(nodeId: string): TValue | undefined
  parent(nodeId: string): string | undefined
  children(nodeId: string): readonly string[]
  rootIds(): readonly string[]
  isRoot(nodeId: string): boolean
  subtree(nodeId: string): MutationTreeSubtreeSnapshot<TValue> | undefined
  isDescendant(nodeId: string, parentId: string): boolean
}

type FamilyEntityMemberReader<
  TFamily
> = TFamily extends {
  members: infer TMembers
}
  ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
    ? {
        [K in keyof TMembers as K extends FamilyStructureNames<TFamily>
          ? never
          : K]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, infer TValue>
          ? KeyedReaderApi<TKey, TValue>
          : () => MemberValueFromSpec<TMembers[K]>
      }
    : {}
  : {}

type FamilyEntitySequenceReader<
  TFamily
> = TFamily extends {
  sequence?: infer TOrdered
}
  ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
    ? {
        [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
          ? OrderedReaderApi<TItem>
          : never
      }
    : {}
  : {}

type FamilyEntityTreeReader<
  TFamily
> = TFamily extends {
  tree?: infer TTree
}
  ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
    ? {
        [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
          ? TreeReaderApi<TValue>
          : never
      }
    : {}
  : {}

type FamilyEntityReader<
  TFamily
> = {
  value(): FamilyEntity<TFamily>
  get(): FamilyEntity<TFamily>
} & FamilyEntityMemberReader<TFamily>
  & FamilyEntitySequenceReader<TFamily>
  & FamilyEntityTreeReader<TFamily>

type FamilyEntityMemberWriter<
  TFamily
> = TFamily extends {
  members: infer TMembers
}
  ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
    ? {
        [K in keyof TMembers as TMembers[K] extends MutationKeyedMemberSpec
          ? K extends FamilyStructureNames<TFamily>
            ? never
            : K
          : never]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, infer TValue>
            ? KeyedWriterApi<TKey, TValue>
            : never
      }
    : {}
  : {}

type FamilyEntitySequenceWriter<
  TFamily
> = TFamily extends {
  sequence?: infer TOrdered
}
  ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
    ? {
        [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
          ? OrderedWriterApi<TItem>
          : never
      }
    : {}
  : {}

type FamilyEntityTreeWriter<
  TFamily
> = TFamily extends {
  tree?: infer TTree
}
  ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
    ? {
        [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
          ? TreeWriterApi<TValue>
          : never
      }
    : {}
  : {}

type FamilyEntityWriter<
  TFamily
> = {
  patch(
    writes: MutationPatchOfMembers<FamilyMembersOf<TFamily>> | Readonly<Record<string, unknown>>
  ): void
  delete(): void
} & FamilyEntityMemberWriter<TFamily>
  & FamilyEntitySequenceWriter<TFamily>
  & FamilyEntityTreeWriter<TFamily>

type CollectionFamilyWriter<
  TFamily
> = {
  (id: Extract<FamilyId<TFamily>, string>): FamilyEntityWriter<TFamily>
  create(
    value: FamilyEntity<TFamily>
  ): void
  patch(
    id: Extract<FamilyId<TFamily>, string>,
    writes: MutationPatchOfMembers<FamilyMembersOf<TFamily>> | Readonly<Record<string, unknown>>
  ): void
  delete(
    id: Extract<FamilyId<TFamily>, string>
  ): void
  remove(
    id: Extract<FamilyId<TFamily>, string>
  ): void
}

type FamilyWriter<
  TFamily
> = TFamily extends {
  kind: 'singleton'
}
  ? {
      create(
        value: FamilyEntity<TFamily>
      ): void
      patch(
        writes: MutationPatchOfMembers<FamilyMembersOf<TFamily>> | Readonly<Record<string, unknown>>
      ): void
      delete(): void
    } & FamilyEntityMemberWriter<TFamily>
      & FamilyEntitySequenceWriter<TFamily>
      & FamilyEntityTreeWriter<TFamily>
  : CollectionFamilyWriter<TFamily>

type ExpandRecursively<TValue> = TValue extends (...args: any[]) => any
  ? TValue
  : TValue extends ReadonlySet<any> | Set<any> | readonly any[] | any[]
    ? TValue
    : TValue extends object
      ? {
          [K in keyof TValue]: ExpandRecursively<TValue[K]>
        }
      : TValue

type MutationWriterShape<
  TModel extends MutationModelDefinition<any>
> = ExpandRecursively<{
  [K in keyof TModel]: TModel[K] extends MutationGroupSpec<infer TChildren extends MutationModelDefinition<any>>
    ? MutationWriterShape<TChildren>
    : FamilyWriter<TModel[K]>
}>

export type MutationWriter<
  TModel extends MutationModelDefinition<any>
> = MutationWriterShape<TModel>

type FamilyReader<TFamily> = (
  TFamily extends {
    kind: 'singleton'
  }
    ? FamilyEntityReader<TFamily>
    : {
        (id: Extract<FamilyId<TFamily>, string>): FamilyEntityReader<TFamily>
        ids(): readonly Extract<FamilyId<TFamily>, string>[]
        list(): readonly FamilyEntity<TFamily>[]
        get(id: Extract<FamilyId<TFamily>, string>): FamilyEntity<TFamily> | undefined
        require(id: Extract<FamilyId<TFamily>, string>): FamilyEntity<TFamily>
        has(id: Extract<FamilyId<TFamily>, string>): boolean
      }
)

type MutationReaderShape<
  TModel extends MutationModelDefinition<any>
> = ExpandRecursively<{
  [K in keyof TModel]: TModel[K] extends MutationGroupSpec<infer TChildren extends MutationModelDefinition<any>>
    ? MutationReaderShape<TChildren>
    : FamilyReader<TModel[K]>
}>

export type MutationReader<
  TModel extends MutationModelDefinition<any>
> = MutationReaderShape<TModel>

type TouchedView<TId extends string> = {
  changed(id?: TId): boolean
  touchedIds(): ReadonlySet<TId> | 'all'
}

type KeyedTouchedView<
  TId extends string,
  TKey extends string
> = {
  changed(id?: TId, key?: TKey): boolean
  touchedIds(): ReadonlySet<TId> | 'all'
  touchedKeys(id?: TId): ReadonlySet<TKey> | 'all'
}

type SingletonKeyedTouchedView<TKey extends string> = {
  changed(key?: TKey): boolean
  touchedKeys(): ReadonlySet<TKey> | 'all'
}

type DeltaFieldView = {
  changed(): boolean
}

type DeltaKeyedView<TKey extends string> = {
  changed(key?: TKey): boolean
  anyChanged(): boolean
  touchedKeys(): ReadonlySet<TKey> | 'all'
  contains(key: TKey): boolean
}

type DeltaSequenceView<TItem> = {
  changed(): boolean
  orderChanged(): boolean
  contains(item: SequenceTarget<TItem>): boolean
  touched(): ReadonlySet<string> | 'all'
}

type DeltaTreeView = {
  changed(): boolean
  structureChanged(): boolean
  nodeChanged(nodeId: string): boolean
}

type FamilyEntityDeltaMembers<
  TFamily
> = TFamily extends {
  members: infer TMembers
}
  ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
    ? {
        [K in keyof TMembers as K extends FamilyStructureNames<TFamily>
          ? never
          : K]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, unknown>
          ? DeltaKeyedView<TKey>
          : DeltaFieldView
      }
    : {}
  : {}

type FamilyEntityDeltaSequences<
  TFamily
> = TFamily extends {
  sequence?: infer TOrdered
}
  ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
    ? {
        [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
          ? DeltaSequenceView<TItem>
          : never
      }
    : {}
  : {}

type FamilyEntityDeltaTrees<
  TFamily
> = TFamily extends {
  tree?: infer TTree
}
  ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
    ? {
        [K in keyof TTree]: DeltaTreeView
      }
    : {}
  : {}

type FamilyEntityDelta<
  TFamily
> = {
  changed(): boolean
} & FamilyEntityDeltaMembers<TFamily>
  & FamilyEntityDeltaSequences<TFamily>
  & FamilyEntityDeltaTrees<TFamily>

type FamilyChangeDeltaEntry<
  TFamily,
  TKey extends keyof FamilyChangesOf<TFamily>
> = TKey extends keyof FamilyMembersOf<TFamily>
  ? FamilyMembersOf<TFamily>[TKey] extends MutationKeyedMemberSpec<infer TMemberKey, unknown>
    ? TFamily extends {
        kind: 'singleton'
      }
      ? SingletonKeyedTouchedView<TMemberKey>
      : KeyedTouchedView<Extract<FamilyId<TFamily>, string>, TMemberKey>
    : TFamily extends {
        kind: 'singleton'
      }
      ? {
          changed(): boolean
        }
      : TouchedView<Extract<FamilyId<TFamily>, string>>
  : TFamily extends {
      kind: 'singleton'
    }
    ? {
        changed(): boolean
      }
    : TouchedView<Extract<FamilyId<TFamily>, string>>

type FamilyStructureDelta<
  TFamily
> = TFamily extends {
  kind: 'singleton'
}
  ? {
      [K in keyof FamilySequenceOf<TFamily>]: {
        changed(): boolean
      }
    } & {
      [K in keyof FamilyTreeOf<TFamily>]: {
        changed(): boolean
      }
    }
  : {
      [K in keyof FamilySequenceOf<TFamily>]: TouchedView<Extract<FamilyId<TFamily>, string>>
    } & {
      [K in keyof FamilyTreeOf<TFamily>]: TouchedView<Extract<FamilyId<TFamily>, string>>
    }

type FamilyDelta<
  TFamily
> = TFamily extends {
  kind: 'singleton'
}
  ? FamilyEntityDelta<TFamily> & {
      [K in keyof FamilyChangesOf<TFamily> as K extends FamilyStructureNames<TFamily>
        ? never
        : K]: FamilyChangeDeltaEntry<TFamily, K>
    } & FamilyStructureDelta<TFamily>
  : {
      (id: Extract<FamilyId<TFamily>, string>): FamilyEntityDelta<TFamily>
      create: TouchedView<Extract<FamilyId<TFamily>, string>>
      delete: TouchedView<Extract<FamilyId<TFamily>, string>>
      changed(id?: Extract<FamilyId<TFamily>, string>): boolean
      touchedIds(): ReadonlySet<Extract<FamilyId<TFamily>, string>> | 'all'
    } & {
      [K in keyof FamilyChangesOf<TFamily> as K extends FamilyStructureNames<TFamily>
        ? never
        : K]: FamilyChangeDeltaEntry<TFamily, K>
    } & FamilyStructureDelta<TFamily>

type MutationDeltaShape<
  TModel extends MutationModelDefinition<any>
> = ExpandRecursively<{
  [K in keyof TModel]: TModel[K] extends MutationGroupSpec<infer TChildren extends MutationModelDefinition<any>>
    ? MutationDeltaShape<TChildren>
    : FamilyDelta<TModel[K]>
}>

export type MutationDeltaOf<
  TModel extends MutationModelDefinition<any>
> = MutationDelta & {
  raw: MutationDelta
} & MutationDeltaShape<TModel>

export type MutationQuery<
  TModel extends MutationModelDefinition<any>
> = MutationReader<TModel> & {
  changes(
    delta: MutationDelta | MutationDeltaInput
  ): MutationDeltaOf<TModel>
}

const createSelectorApi = <
  TMembers extends Readonly<Record<string, MutationMemberSpec>>
>(): SelectorApi<TMembers> => ({
  value: (key) => ({
    kind: 'field',
    member: key
  }),
  object: (key) => ({
    self: () => ({
      kind: 'record',
      member: key,
      mode: 'self'
    }),
    deep: () => ({
      kind: 'record',
      member: key,
      mode: 'deep'
    })
  }),
  dictionary: (key) => ({
    self: () => ({
      kind: 'keyed',
      member: key,
      mode: 'self'
    }),
    deep: () => ({
      kind: 'keyed',
      member: key,
      mode: 'deep'
    })
  })
})

type CompiledFamily = {
  name: string
  kind: 'singleton' | 'map' | 'table'
  members: Readonly<Record<string, MutationMemberSpec>>
  changeKeys: readonly string[]
  sequence: Readonly<Record<string, string>>
  tree: Readonly<Record<string, string>>
}

type CompiledModel<
  Doc
> = {
  entities: ReadonlyMap<string, CompiledEntitySpec>
  ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
  families: readonly CompiledFamily[]
}

const isMutationGroupSpec = (
  value: unknown
): value is MutationGroupSpec<MutationModelDefinition<any>> => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value)
  && (value as {
    kind?: unknown
  }).kind === 'group'
)

const forEachMutationFamily = <Doc>(
  model: MutationModelDefinition<Doc>,
  visit: (familyName: string, family: MutationFamilySpec<Doc>) => void,
  prefix = ''
) => {
  Object.entries(model).forEach(([name, entry]) => {
    const familyName = prefix
      ? `${prefix}.${name}`
      : name

    if (isMutationGroupSpec(entry)) {
      forEachMutationFamily(
        entry.children as MutationModelDefinition<Doc>,
        visit,
        familyName
      )
      return
    }

    visit(familyName, entry as MutationFamilySpec<Doc>)
  })
}

const normalizeFamilyChanges = (
  family: {
    members: Readonly<Record<string, MutationMemberSpec>>
    changes?: MutationFamilyChanges<Readonly<Record<string, MutationMemberSpec>>>
  }
): Readonly<Record<string, readonly MutationChangeSelector[]>> => {
  if (!family.changes) {
    return {}
  }

  return typeof family.changes === 'function'
    ? family.changes(createSelectorApi())
    : family.changes
}

const readSelectorPath = (
  members: Readonly<Record<string, MutationMemberSpec>>,
  selector: MutationChangeSelector
): string => {
  const member = members[selector.member]
  if (!member) {
    throw new Error(`Unknown mutation model member "${selector.member}".`)
  }
  const base = member.at ?? selector.member
  if (selector.kind === 'field') {
    return base
  }
  return selector.mode === 'self'
    ? base
    : `${base}.**`
}

export const compileMutationModel = <
  Doc,
  const TModel extends MutationModelDefinition<Doc>
>(
  model: TModel
): CompiledModel<Doc> => {
  const entity: Record<string, import('./engine/contracts').MutationEntitySpec> = {}
  const orderedRegistry = new Map<string, CompiledOrderedSpec<Doc>>()
  const treeRegistry = new Map<string, CompiledTreeSpec<Doc>>()
  const families: CompiledFamily[] = []
  const familySpecs = new Map<string, MutationFamilySpec<Doc>>()

  forEachMutationFamily(model, (familyName, family) => {
    familySpecs.set(familyName, family)
    const changes = normalizeFamilyChanges(family)
    const members = family.members
    entity[familyName] = {
      kind: family.kind,
      members: Object.fromEntries(
        Object.entries(members).map(([name, spec]) => [
          name,
          spec.kind === 'keyed'
            ? 'record'
            : spec.kind
        ])
      ),
      change: Object.fromEntries(
        Object.entries(changes).map(([aspect, selectors]) => [
          aspect,
          selectors.map((selector) => readSelectorPath(members, selector))
        ])
      )
    }

    families.push({
      name: familyName,
      kind: family.kind,
      members,
      changeKeys: Object.keys(changes),
      sequence: Object.fromEntries(
        Object.entries(family.sequence ?? {}).map(([name, spec]) => [
          name,
          (spec as {
            emits: string
          }).emits
        ])
      ),
      tree: Object.fromEntries(
        Object.entries(family.tree ?? {}).map(([name, spec]) => [
          name,
          (spec as {
            emits: string
          }).emits
        ])
      )
    })

    Object.entries(family.sequence ?? {}).forEach(([name, spec]) => {
      const type = `${familyName}.${name}`
      if (family.kind === 'singleton') {
        const orderedSpec = spec as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>
        orderedRegistry.set(type, {
          type,
          read: (document) => orderedSpec.read(document),
          write: (document, _key, items) => orderedSpec.write(document, items),
          identify: (item) => orderedSpec.identify(item),
          ...(orderedSpec.clone === undefined ? {} : { clone: orderedSpec.clone }),
          ...(orderedSpec.patch === undefined ? {} : { patch: orderedSpec.patch }),
          ...(orderedSpec.diff === undefined ? {} : { diff: orderedSpec.diff }),
          change: [{
            key: `${familyName}.${orderedSpec.emits}`,
            change: {
              order: true
            }
          }]
        })
        return
      }

      const orderedSpec = spec as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>
      orderedRegistry.set(type, {
        type,
        read: (document, key) => orderedSpec.read(document, key ?? ''),
        write: (document, key, items) => orderedSpec.write(document, key ?? '', items),
        identify: (item) => orderedSpec.identify(item),
        ...(orderedSpec.clone === undefined ? {} : { clone: orderedSpec.clone }),
        ...(orderedSpec.patch === undefined ? {} : { patch: orderedSpec.patch }),
        ...(orderedSpec.diff === undefined ? {} : { diff: orderedSpec.diff }),
        change: (key) => key
          ? [{
              key: `${familyName}.${orderedSpec.emits}`,
              change: [key]
            }]
          : [{
              key: `${familyName}.${orderedSpec.emits}`,
              change: true
            }]
      })
    })

    Object.entries(family.tree ?? {}).forEach(([name, spec]) => {
      const type = `${familyName}.${name}`
      if (family.kind === 'singleton') {
        const treeSpec = spec as MutationTreeFamilySpec<Doc, 'singleton', unknown, string>
        treeRegistry.set(type, {
          type,
          read: (document) => treeSpec.read(document),
          write: (document, _key, treeValue) => treeSpec.write(document, treeValue),
          ...(treeSpec.clone === undefined ? {} : { clone: treeSpec.clone }),
          ...(treeSpec.patch === undefined ? {} : { patch: treeSpec.patch }),
          ...(treeSpec.diff === undefined ? {} : { diff: treeSpec.diff }),
          change: [{
            key: `${familyName}.${treeSpec.emits}`,
            change: true
          }]
        })
        return
      }

      const treeSpec = spec as MutationTreeFamilySpec<Doc, 'map' | 'table', unknown, string>
      treeRegistry.set(type, {
        type,
        read: (document, key) => treeSpec.read(document, key ?? ''),
        write: (document, key, treeValue) => treeSpec.write(document, key ?? '', treeValue),
        ...(treeSpec.clone === undefined ? {} : { clone: treeSpec.clone }),
        ...(treeSpec.patch === undefined ? {} : { patch: treeSpec.patch }),
        ...(treeSpec.diff === undefined ? {} : { diff: treeSpec.diff }),
        change: (key) => key
          ? [{
              key: `${familyName}.${treeSpec.emits}`,
              change: [key]
            }]
          : [{
              key: `${familyName}.${treeSpec.emits}`,
              change: true
            }]
      })
    })
  })

  const compiledEntities = new Map<string, CompiledEntitySpec>()
  compileEntities(entity).forEach((spec, family) => {
    const familySpec = familySpecs.get(family)
    if (!familySpec) {
      throw new Error(`Unknown compiled mutation family "${family}".`)
    }
    compiledEntities.set(family, {
      ...spec,
      access: {
        read: familySpec.access.read as (document: unknown) => unknown,
        write: familySpec.access.write as (document: unknown, next: unknown) => unknown
      }
    })
  })

  return {
    entities: compiledEntities,
    ordered: orderedRegistry,
    tree: treeRegistry,
    families
  }
}

const lowerPatchWrites = (
  members: Readonly<Record<string, MutationMemberSpec>>,
  input: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> => {
  const writes: Record<string, unknown> = {}

  const visitRecord = (
    base: string,
    value: unknown
  ) => {
    if (
      typeof value !== 'object'
      || value === null
      || Array.isArray(value)
    ) {
      writes[base] = value
      return
    }
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return
    }
    entries.forEach(([key, nested]) => {
      visitRecord(
        base
          ? `${base}.${key}`
          : key,
        nested
      )
    })
  }

  const visitKeyed = (
    base: string,
    value: unknown
  ) => {
    if (
      typeof value !== 'object'
      || value === null
      || Array.isArray(value)
    ) {
      writes[base] = value
      return
    }

    Object.entries(value).forEach(([key, nested]) => {
      writes[`${base}.${key}`] = nested === undefined
        ? unsetRecordWrite()
        : nested
    })
  }

  Object.entries(input).forEach(([memberName, value]) => {
    const member = members[memberName]
    if (!member) {
      writes[memberName] = value
      return
    }
    const path = member.at ?? memberName
    if (member.kind === 'field') {
      writes[path] = value === undefined
        ? unsetRecordWrite()
        : value
      return
    }
    if (member.kind === 'keyed') {
      visitKeyed(path, value)
      return
    }
    visitRecord(path, value)
  })

  return writes
}

export const createMutationWriter = <
  Doc,
  const TModel extends MutationModelDefinition<Doc>
>(
  model: TModel,
  base: MutationProgramWriter,
  readDocument?: () => Doc
): MutationWriter<TModel> => {
  const result: Record<string, unknown> = {}

  const normalizeSequenceAnchor = (
    anchor?: MutationSequenceAnchor
  ): MutationOrderedAnchor => {
    if (!anchor) {
      return {
        kind: 'end'
      }
    }
    if ('kind' in anchor) {
      return anchor
    }
    if (anchor.before !== undefined) {
      return {
        kind: 'before',
        itemId: anchor.before
      }
    }
    if (anchor.after !== undefined) {
      return {
        kind: 'after',
        itemId: anchor.after
      }
    }
    return {
      kind: 'end'
    }
  }

  const createEntityRef = (
    familyName: string,
    id: string
  ) => ({
    kind: 'entity' as const,
    type: familyName,
    id
  })

  const resolveSequenceItemId = (
    identify: (item: unknown) => string,
    item: unknown
  ): string => typeof item === 'string'
    ? item
    : identify(item)

  const createOrderedWriterApi = (
    type: string,
    identify: (item: unknown) => string,
    key?: string,
    readItems?: () => readonly unknown[]
  ) => {
    const target = key === undefined
      ? {
          kind: 'ordered' as const,
          type
        }
      : {
          kind: 'ordered' as const,
          type,
          key
        }

    return {
      insert: (value: unknown, to?: MutationSequenceAnchor) => base.ordered.insert(
        target,
        identify(value),
        value,
        normalizeSequenceAnchor(to)
      ),
      move: (item: unknown, to?: MutationSequenceAnchor) => base.ordered.move(
        target,
        resolveSequenceItemId(identify, item),
        normalizeSequenceAnchor(to)
      ),
      splice: (itemIds: readonly string[], to?: MutationSequenceAnchor) => base.ordered.splice(
        target,
        itemIds,
        normalizeSequenceAnchor(to)
      ),
      patch: (item: unknown, patch: unknown) => base.ordered.patch(
        target,
        resolveSequenceItemId(identify, item),
        patch
      ),
      delete: (item: unknown) => base.ordered.delete(
        target,
        resolveSequenceItemId(identify, item)
      ),
      remove: (item: unknown) => base.ordered.delete(
        target,
        resolveSequenceItemId(identify, item)
      ),
      replace: (items: readonly unknown[]) => {
        if (!readItems) {
          throw new Error(`Mutation writer ordered "${type}" requires read access to replace items.`)
        }

        const currentItems = readItems()
        const currentIds = new Set(currentItems.map((item) => identify(item)))
        const nextIds = items.map((item) => identify(item))
        const nextIdSet = new Set(nextIds)

        currentItems.forEach((item) => {
          const itemId = identify(item)
          if (!nextIdSet.has(itemId)) {
            base.ordered.delete(target, itemId)
          }
        })

        items.forEach((item, index) => {
          const itemId = identify(item)
          const to = index === 0
            ? {
                kind: 'start' as const
              }
            : {
                kind: 'after' as const,
                itemId: nextIds[index - 1]!
              }

          if (currentIds.has(itemId)) {
            base.ordered.move(target, itemId, to)
            return
          }

          base.ordered.insert(target, itemId, item, to)
        })
      }
    }
  }

  const createTreeWriterApi = (
    type: string,
    key?: string
  ) => {
    const target = key === undefined
      ? {
          kind: 'tree' as const,
          type
        }
      : {
          kind: 'tree' as const,
          type,
          key
        }

    return {
      insert: (nodeId: string, location?: MutationTreeLocation<unknown>) => base.tree.insert(
        target,
        nodeId,
        location?.parentId,
        location?.index,
        location?.value
      ),
      move: (nodeId: string, location?: Omit<MutationTreeLocation<unknown>, 'value'>) => base.tree.move(
        target,
        nodeId,
        location?.parentId,
        location?.index
      ),
      delete: (nodeId: string) => base.tree.delete(target, nodeId),
      remove: (nodeId: string) => base.tree.delete(target, nodeId),
      patch: (nodeId: string, patch: unknown) => base.tree.patch(target, nodeId, patch)
    }
  }

  const createEntityWriterApi = (
    familyName: string,
    family: MutationFamilySpec<Doc>,
    id: string
  ) => {
    const entityRef = createEntityRef(familyName, id)
    const familyWriter: Record<string, unknown> = {
      patch: (writes: Readonly<Record<string, unknown>>) => {
        base.entity.patch(
          entityRef,
          lowerPatchWrites(family.members, writes)
        )
      },
      delete: () => {
        base.entity.delete(entityRef)
      }
    }

    Object.entries(family.members).forEach(([name, member]) => {
      if (member.kind !== 'keyed') {
        return
      }

      const path = member.at ?? name
      familyWriter[name] = {
        set: (key: string, value: unknown) => base.entity.patch(entityRef, {
          [`${path}.${key}`]: value
        }),
        delete: (key: string) => base.entity.patch(entityRef, {
          [`${path}.${key}`]: undefined
        }),
        remove: (key: string) => base.entity.patch(entityRef, {
          [`${path}.${key}`]: undefined
        })
      }
    })

    Object.entries(family.sequence ?? {}).forEach(([name, spec]) => {
      const type = `${familyName}.${name}`
      const readItems = readDocument
        ? family.kind === 'singleton'
          ? () => (
              spec as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>
            ).read(readDocument())
          : () => (
              spec as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>
            ).read(readDocument(), id)
        : undefined

      familyWriter[name] = createOrderedWriterApi(
        type,
        (spec as MutationOrderedFamilySpec<Doc, any, unknown, string>).identify,
        family.kind === 'singleton'
          ? undefined
          : id,
        readItems
      )
    })

    Object.entries(family.tree ?? {}).forEach(([name]) => {
      familyWriter[name] = createTreeWriterApi(
        `${familyName}.${name}`,
        family.kind === 'singleton'
          ? undefined
          : id
      )
    })

    return familyWriter
  }

  forEachMutationFamily(model, (familyName, family) => {
    const createValue = (value: unknown) => {
      base.entity.create(
        createEntityRef(
          familyName,
          family.kind === 'singleton'
            ? familyName
            : String((value as {
                id?: unknown
              }).id)
        ),
        value
      )
    }

    const patchValue = (
      id: string,
      writes: Readonly<Record<string, unknown>>
    ) => {
      base.entity.patch(
        createEntityRef(familyName, id),
        lowerPatchWrites(family.members, writes)
      )
    }

    const deleteValue = (id: string) => {
      base.entity.delete(createEntityRef(familyName, id))
    }

    const familyWriter = family.kind === 'singleton'
      ? {
          create: createValue,
          ...createEntityWriterApi(
            familyName,
            family,
            familyName
          )
        }
      : Object.assign(
          (id: string) => createEntityWriterApi(
            familyName,
            family,
            id
          ),
          {
            create: createValue,
            patch: (id: string, writes: Readonly<Record<string, unknown>>) => patchValue(id, writes),
            delete: (id: string) => deleteValue(id),
            remove: (id: string) => deleteValue(id)
          }
        )

    assignNested(result, familyName, familyWriter)
  })

  return result as MutationWriter<TModel>
}

const readCollection = (
  value: unknown,
  familyName: string
): Record<string, unknown> => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(`Mutation reader family "${familyName}" must resolve to an object collection.`)
  }

  return value as Record<string, unknown>
}

const readKeyedCollection = (
  value: unknown,
  _familyName: string,
  _memberName: string
): Record<string, unknown> => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
  ) {
    return {}
  }

  return value as Record<string, unknown>
}

export const createMutationReader = <
  Doc,
  const TModel extends MutationModelDefinition<Doc>
>(
  model: TModel,
  readDocument: () => Doc
): MutationReader<TModel> => {
  const result: Record<string, unknown> = {}

  const readMemberValue = (
    entity: unknown,
    memberName: string,
    member: MutationMemberSpec
  ) => readObjectPath(
    entity,
    (member.at ?? memberName).split('.').filter(Boolean)
  )

  const createKeyedReader = (
    value: unknown
  ) => {
    const collection = readKeyedCollection(value, '', '')
    return {
      get: (key: string) => collection[key],
      has: (key: string) => Object.prototype.hasOwnProperty.call(collection, key),
      keys: () => Object.keys(collection),
      entries: () => Object.entries(collection) as readonly (readonly [string, unknown])[]
    }
  }

  const resolveSequenceItemId = (
    identify: (item: unknown) => string,
    item: unknown
  ): string => typeof item === 'string'
    ? item
    : identify(item)

  const createOrderedReaderApi = (
    spec: MutationOrderedFamilySpec<Doc, any, unknown, string>,
    key?: string
  ) => {
    const readItems = () => key === undefined
      ? (spec as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>).read(readDocument())
      : (spec as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>).read(readDocument(), key)

    const locate = (items: readonly unknown[], target: unknown) => {
      const itemId = resolveSequenceItemId(spec.identify, target)
      return items.findIndex((item) => spec.identify(item) === itemId)
    }

    return {
      items: () => readItems(),
      ids: () => readItems().map((item) => spec.identify(item)),
      contains: (target: unknown) => locate(readItems(), target) >= 0,
      indexOf: (target: unknown) => locate(readItems(), target),
      before: (target: unknown) => {
        const items = readItems()
        const index = locate(items, target)
        return index > 0
          ? items[index - 1]
          : undefined
      },
      after: (target: unknown) => {
        const items = readItems()
        const index = locate(items, target)
        return index >= 0
          ? items[index + 1]
          : undefined
      },
      slot: (target: unknown) => {
        const items = readItems()
        const index = locate(items, target)
        if (index < 0) {
          return undefined
        }
        return {
          prev: items[index - 1],
          next: items[index + 1]
        }
      }
    }
  }

  const createTreeSubtreeSnapshot = (
    tree: MutationTreeSnapshot<unknown>,
    nodeId: string
  ): MutationTreeSubtreeSnapshot<unknown> | undefined => {
    const node = tree.nodes[nodeId]
    if (!node) {
      return undefined
    }

    const ids: string[] = []
    const visit = (currentId: string) => {
      ids.push(currentId)
      const current = tree.nodes[currentId]
      current?.children.forEach((childId) => {
        visit(childId)
      })
    }
    visit(nodeId)

    const siblings = node.parentId === undefined
      ? tree.rootIds
      : (tree.nodes[node.parentId]?.children ?? [])

    return {
      rootId: nodeId,
      parentId: node.parentId,
      index: siblings.indexOf(nodeId),
      nodes: Object.fromEntries(ids.map((id) => [
        id,
        tree.nodes[id]!
      ]))
    }
  }

  const createTreeReaderApi = (
    spec: MutationTreeFamilySpec<Doc, any, unknown, string>,
    key?: string
  ) => {
    const readTree = () => key === undefined
      ? (spec as MutationTreeFamilySpec<Doc, 'singleton', unknown, string>).read(readDocument())
      : (spec as MutationTreeFamilySpec<Doc, 'map' | 'table', unknown, string>).read(readDocument(), key)

    return {
      snapshot: () => readTree(),
      has: (nodeId: string) => readTree().nodes[nodeId] !== undefined,
      node: (nodeId: string) => readTree().nodes[nodeId],
      value: (nodeId: string) => readTree().nodes[nodeId]?.value,
      parent: (nodeId: string) => readTree().nodes[nodeId]?.parentId,
      children: (nodeId: string) => readTree().nodes[nodeId]?.children ?? [],
      rootIds: () => readTree().rootIds,
      isRoot: (nodeId: string) => readTree().rootIds.includes(nodeId),
      subtree: (nodeId: string) => createTreeSubtreeSnapshot(readTree(), nodeId),
      isDescendant: (nodeId: string, parentId: string) => {
        const tree = readTree()
        let currentId = tree.nodes[nodeId]?.parentId
        while (currentId !== undefined) {
          if (currentId === parentId) {
            return true
          }
          currentId = tree.nodes[currentId]?.parentId
        }
        return false
      }
    }
  }

  const createEntityReaderApi = (
    familyName: string,
    family: MutationFamilySpec<Doc>,
    readEntity: () => unknown,
    entityId?: string
  ) => {
    const familyReader: Record<string, unknown> = {
      value: () => readEntity(),
      get: () => readEntity()
    }

    Object.entries(family.members).forEach(([name, member]) => {
      if (member.kind === 'keyed') {
        familyReader[name] = createKeyedReader(
          readMemberValue(readEntity(), name, member)
        )
        return
      }

      familyReader[name] = () => readMemberValue(
        readEntity(),
        name,
        member
      )
    })

    Object.entries(family.sequence ?? {}).forEach(([name, spec]) => {
      familyReader[name] = createOrderedReaderApi(
        spec as MutationOrderedFamilySpec<Doc, any, unknown, string>,
        family.kind === 'singleton'
          ? undefined
          : entityId
      )
    })

    Object.entries(family.tree ?? {}).forEach(([name, spec]) => {
      familyReader[name] = createTreeReaderApi(
        spec as MutationTreeFamilySpec<Doc, any, unknown, string>,
        family.kind === 'singleton'
          ? undefined
          : entityId
      )
    })

    return familyReader
  }

  forEachMutationFamily(model, (familyName, family) => {
    const readFamily = () => readCollection(
      family.access.read(readDocument()),
      familyName
    )

    const familyReader = family.kind === 'singleton'
      ? createEntityReaderApi(
          familyName,
          family,
          () => family.access.read(readDocument()),
          familyName
        )
      : Object.assign(
          (id: string) => createEntityReaderApi(
            familyName,
            family,
            () => {
              const value = readFamily()[id]
              if (value === undefined) {
                throw new Error(`Mutation reader family "${familyName}" cannot find entity "${id}".`)
              }
              return value
            },
            id
          ),
          {
            ids: () => Object.keys(readFamily()),
            list: () => Object.values(readFamily()),
            get: (id: string) => readFamily()[id],
            require: (id: string) => {
              const value = readFamily()[id]
              if (value === undefined) {
                throw new Error(`Mutation reader family "${familyName}" cannot find entity "${id}".`)
              }
              return value
            },
            has: (id: string) => readFamily()[id] !== undefined
          }
        )

    assignNested(result, familyName, familyReader)
  })

  return result as MutationReader<TModel>
}

const readTouchedIds = <TId extends string>(
  delta: MutationDelta,
  keys: readonly string[]
): ReadonlySet<TId> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  let result: Set<TId> | undefined
  for (let index = 0; index < keys.length; index += 1) {
    const ids = delta.ids(keys[index]!)
    if (ids === 'all') {
      return 'all'
    }
    if (ids.size === 0) {
      continue
    }
    if (!result) {
      result = new Set<TId>()
    }
    ids.forEach((id) => {
      result!.add(id as TId)
    })
  }

  return result ?? new Set<TId>()
}

const assignNested = (
  target: Record<string, unknown>,
  path: string,
  value: unknown
) => {
  const segments = path.split('.')
  let current = target

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!
    const next = current[segment]
    if (
      typeof next === 'object'
      && next !== null
      && !Array.isArray(next)
    ) {
      current = next as Record<string, unknown>
      continue
    }

    const created: Record<string, unknown> = {}
    current[segment] = created
    current = created
  }

  current[segments[segments.length - 1]!] = value
}

const createTouchedView = <TId extends string>(
  delta: MutationDelta,
  key: string
): TouchedView<TId> => ({
  changed: (id?: TId) => delta.reset === true || delta.changed(key, id),
  touchedIds: () => readTouchedIds<TId>(delta, [key])
})

const readChangedPaths = (
  delta: MutationDelta,
  key: string,
  id: string
): readonly string[] | 'all' | undefined => delta.reset === true
  ? 'all'
  : delta.paths(key, id)

const normalizeKeyedPathKey = (
  base: string,
  path: string
): string | undefined => {
  if (!path) {
    return undefined
  }

  if (path === base) {
    return undefined
  }

  if (!path.startsWith(`${base}.`)) {
    return undefined
  }

  const suffix = path.slice(base.length + 1)
  const dot = suffix.indexOf('.')
  return dot === -1
    ? suffix
    : suffix.slice(0, dot)
}

const readTouchedKeyedKeys = <TKey extends string>(
  delta: MutationDelta,
  key: string,
  base: string,
  id?: string
): ReadonlySet<TKey> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  const changes = delta.changes[key]?.paths
  if (changes === 'all') {
    return 'all'
  }

  const keys = new Set<TKey>()
  const collect = (value: readonly string[] | 'all' | undefined) => {
    if (value === 'all') {
      return 'all' as const
    }
    value?.forEach((path) => {
      const touchedKey = normalizeKeyedPathKey(base, path)
      if (touchedKey) {
        keys.add(touchedKey as TKey)
      }
    })
    return undefined
  }

  if (id !== undefined) {
    const result = collect(changes?.[id])
    return result ?? keys
  }

  const entries = Object.values(changes ?? {})
  for (let index = 0; index < entries.length; index += 1) {
    const result = collect(entries[index])
    if (result === 'all') {
      return 'all'
    }
  }

  return keys
}

const createCollectionKeyedTouchedView = <
  TId extends string,
  TKey extends string
>(
  delta: MutationDelta,
  changeKey: string,
  base: string
): KeyedTouchedView<TId, TKey> => ({
  changed: (id?: TId, key?: TKey) => {
    if (delta.reset === true) {
      return true
    }
    if (id === undefined) {
      return delta.has(changeKey)
    }
    if (key === undefined) {
      return delta.changed(changeKey, id)
    }
    const paths = readChangedPaths(delta, changeKey, id)
    if (paths === 'all') {
      return true
    }
    return (paths ?? []).some((path) => normalizeKeyedPathKey(base, path) === key)
  },
  touchedIds: () => readTouchedIds<TId>(delta, [changeKey]),
  touchedKeys: (id?: TId) => readTouchedKeyedKeys<TKey>(delta, changeKey, base, id)
})

const createSingletonKeyedTouchedView = <
  TKey extends string
>(
  delta: MutationDelta,
  changeKey: string,
  base: string
): SingletonKeyedTouchedView<TKey> => ({
  changed: (key?: TKey) => {
    if (delta.reset === true || key === undefined) {
      return delta.reset === true || delta.has(changeKey)
    }

    const change = delta.changes[changeKey]
    if (change?.paths === 'all') {
      return true
    }

    const entries = Object.values(change?.paths ?? {})
    for (let index = 0; index < entries.length; index += 1) {
      const value = entries[index]
      if (value === 'all') {
        return true
      }
      if (value?.some((path) => normalizeKeyedPathKey(base, path) === key)) {
        return true
      }
    }

    return false
  },
  touchedKeys: () => readTouchedKeyedKeys<TKey>(delta, changeKey, base)
})

const DELTA_CACHE = new WeakMap<object, WeakMap<MutationDelta, MutationDeltaOf<any>>>()

const freezeDeep = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (
    typeof value !== 'object'
    || value === null
    || seen.has(value)
  ) {
    return value
  }

  seen.add(value)

  const target = value as Record<string, unknown>
  Object.getOwnPropertyNames(target).forEach((key) => {
    freezeDeep(target[key], seen)
  })

  return Object.freeze(value)
}

export const createMutationDelta = <
  Doc,
  const TModel extends MutationModelDefinition<Doc>
>(
  model: TModel,
  raw: MutationDelta | MutationDeltaInput
): MutationDeltaOf<TModel> => {
  const normalized = normalizeMutationDelta(raw)
  const modelCache = DELTA_CACHE.get(model as object)
  const cached = modelCache?.get(normalized)
  if (cached) {
    return cached as MutationDeltaOf<TModel>
  }

  const result: Record<string, unknown> = {
    ...(normalized as unknown as Record<string, unknown>),
    raw: normalized
  }

  const resolveSequenceItemId = (
    identify: (item: unknown) => string,
    value: unknown
  ): string => typeof value === 'string'
    ? value
    : identify(value)

  const createEntityDeltaView = (
    familyName: string,
    family: MutationFamilySpec<Doc>,
    entityId: string | undefined,
    changeKeys: readonly string[]
  ) => {
    const entityDelta: Record<string, unknown> = {
      changed: () => normalized.reset === true || (
        entityId === undefined
          ? changeKeys.some((key) => normalized.has(key))
          : changeKeys.some((key) => normalized.changed(key, entityId))
      )
    }

    changeKeys.forEach((fullKey) => {
      const memberName = fullKey.slice(familyName.length + 1)
      const member = family.members[memberName]
      if (!member) {
        return
      }

      if (member.kind === 'keyed') {
        const singletonView = entityId === undefined
          ? createSingletonKeyedTouchedView(
              normalized,
              fullKey,
              member.at ?? memberName
            )
          : undefined
        const collectionView = entityId === undefined
          ? undefined
          : createCollectionKeyedTouchedView<string, string>(
              normalized,
              fullKey,
              member.at ?? memberName
            )

        entityDelta[memberName] = {
          changed: (key?: string) => entityId === undefined
            ? singletonView!.changed(key)
            : collectionView!.changed(entityId, key),
          anyChanged: () => entityId === undefined
            ? singletonView!.changed()
            : collectionView!.changed(entityId),
          touchedKeys: () => entityId === undefined
            ? singletonView!.touchedKeys()
            : collectionView!.touchedKeys(entityId),
          contains: (key: string) => entityId === undefined
            ? singletonView!.changed(key)
            : collectionView!.changed(entityId, key)
        }
        return
      }

      entityDelta[memberName] = {
        changed: () => normalized.reset === true || (
          entityId === undefined
            ? normalized.has(fullKey)
            : normalized.changed(fullKey, entityId)
        )
      }
    })

    Object.entries(family.sequence ?? {}).forEach(([name, spec]) => {
      const sequenceSpec = spec as MutationOrderedFamilySpec<Doc, any, unknown, string>
      const fullKey = `${familyName}.${sequenceSpec.emits}`
      entityDelta[name] = {
        changed: () => normalized.reset === true || (
          entityId === undefined
            ? normalized.has(fullKey)
            : normalized.changed(fullKey, entityId)
        ),
        orderChanged: () => normalized.reset === true || (
          entityId === undefined
            ? normalized.has(fullKey)
            : normalized.changed(fullKey, entityId)
        ),
        contains: (value: unknown) => {
          if (normalized.reset === true) {
            return true
          }
          const ids = normalized.ids(fullKey)
          if (ids === 'all') {
            return true
          }
          return ids.has(resolveSequenceItemId(sequenceSpec.identify, value))
        },
        touched: () => readTouchedIds<string>(normalized, [fullKey])
      }
    })

    Object.entries(family.tree ?? {}).forEach(([name, spec]) => {
      const treeSpec = spec as MutationTreeFamilySpec<Doc, any, unknown, string>
      const fullKey = `${familyName}.${treeSpec.emits}`
      entityDelta[name] = {
        changed: () => normalized.reset === true || (
          entityId === undefined
            ? normalized.has(fullKey)
            : normalized.changed(fullKey, entityId)
        ),
        structureChanged: () => normalized.reset === true || (
          entityId === undefined
            ? normalized.has(fullKey)
            : normalized.changed(fullKey, entityId)
        ),
        nodeChanged: (nodeId: string) => {
          if (normalized.reset === true) {
            return true
          }
          const ids = normalized.ids(fullKey)
          if (ids === 'all') {
            return true
          }
          return ids.has(nodeId)
        }
      }
    })

    return entityDelta
  }

  forEachMutationFamily(model, (familyName, family) => {
    const changeMap = normalizeFamilyChanges(family)
    const memberChangeKeys = Object.keys(changeMap).map((key) => `${familyName}.${key}`)

    if (family.kind === 'singleton') {
      assignNested(
        result,
        familyName,
        createEntityDeltaView(
          familyName,
          family,
          undefined,
          [
            ...memberChangeKeys,
            ...Object.values(family.sequence ?? {}).map((spec) => `${familyName}.${(spec as MutationOrderedFamilySpec<Doc, any, unknown, string>).emits}`),
            ...Object.values(family.tree ?? {}).map((spec) => `${familyName}.${(spec as MutationTreeFamilySpec<Doc, any, unknown, string>).emits}`)
          ]
        )
      )
      return
    }

    const familyKeys = [
      `${familyName}.create`,
      `${familyName}.delete`,
      ...memberChangeKeys,
      ...Object.values(family.sequence ?? {}).map((spec) => `${familyName}.${(spec as MutationOrderedFamilySpec<Doc, any, unknown, string>).emits}`),
      ...Object.values(family.tree ?? {}).map((spec) => `${familyName}.${(spec as MutationTreeFamilySpec<Doc, any, unknown, string>).emits}`)
    ]
    const familyDelta = Object.assign(
      (id: string) => createEntityDeltaView(
        familyName,
        family,
        id,
        familyKeys
      ),
      {
        create: createTouchedView(normalized, `${familyName}.create`),
        delete: createTouchedView(normalized, `${familyName}.delete`),
        changed: (id?: string) => {
          if (normalized.reset === true) {
            return true
          }

          if (id === undefined) {
            return familyKeys.some((key) => normalized.has(key))
          }

          return familyKeys.some((key) => normalized.changed(key, id))
        },
        touchedIds: () => readTouchedIds(normalized, familyKeys)
      }
    ) as unknown as Record<string, unknown>

    Object.keys(changeMap).forEach((key) => {
      const member = family.members[key]
      familyDelta[key] = member?.kind === 'keyed'
        ? createCollectionKeyedTouchedView(
            normalized,
            `${familyName}.${key}`,
            member.at ?? key
          )
        : createTouchedView(normalized, `${familyName}.${key}`)
    })

    Object.entries(family.sequence ?? {}).forEach(([name, spec]) => {
      familyDelta[name] = createTouchedView(normalized, `${familyName}.${(spec as MutationOrderedFamilySpec<Doc, any, unknown, string>).emits}`)
    })

    Object.entries(family.tree ?? {}).forEach(([name, spec]) => {
      familyDelta[name] = createTouchedView(normalized, `${familyName}.${(spec as MutationTreeFamilySpec<Doc, any, unknown, string>).emits}`)
    })

    assignNested(result, familyName, familyDelta)
  })

  const typed = freezeDeep(result) as MutationDeltaOf<TModel>
  const nextModelCache = modelCache ?? new WeakMap<MutationDelta, MutationDeltaOf<any>>()
  if (!modelCache) {
    DELTA_CACHE.set(model as object, nextModelCache)
  }
  nextModelCache.set(normalized, typed as MutationDeltaOf<any>)
  return typed
}

export const createMutationQuery = <
  Doc,
  const TModel extends MutationModelDefinition<Doc>
>(
  model: TModel,
  input: MutationReader<TModel> | (() => Doc)
): MutationQuery<TModel> => {
  const reader = typeof input === 'function'
    ? createMutationReader(model, input)
    : input

  return {
    ...(reader as unknown as Record<string, unknown>),
    changes: (delta: MutationDelta | MutationDeltaInput) => createMutationDelta(
      model,
      delta
    )
  } as MutationQuery<TModel>
}

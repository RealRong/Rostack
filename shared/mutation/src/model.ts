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
  MutationRegistry
} from './engine/registry'
import type {
  CompiledEntitySpec
} from './engine/contracts'
import type {
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot
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
  record<TKey extends keyof TMembers & string>(
    key: TMembers[TKey] extends MutationRecordMemberSpec
      ? TKey
      : never
  ): {
    self(): RecordSelector
    deep(): RecordSelector
  }
  keyed<TKey extends keyof TMembers & string>(
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

type FamilyAccess<
  Doc,
  Entity
> = {
  read(document: Doc): unknown
  write(document: Doc, next: unknown): Doc
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
  access: FamilyAccess<Doc, Entity>
  members: Members
  changes?: MutationFamilyChanges<Members>
  ordered?: Ordered
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

export type MutationModelDefinition<
  Doc
> = Readonly<Record<string, MutationSingletonFamilySpec<Doc, unknown, Readonly<Record<string, MutationMemberSpec>>, Readonly<Record<string, readonly MutationChangeSelector[]>>, any, any> | MutationCollectionFamilySpec<Doc, 'map' | 'table', string, unknown, Readonly<Record<string, MutationMemberSpec>>, Readonly<Record<string, readonly MutationChangeSelector[]>>, any, any>>>

export type MutationModel<Doc, TDefinition extends MutationModelDefinition<Doc> = MutationModelDefinition<Doc>> = TDefinition

export const defineMutationModel = <
  Doc
>() => <
  const TDefinition extends MutationModelDefinition<Doc>
>(
  definition: TDefinition
): TDefinition => definition

export const value = <TValue,>(
  input: {
    at?: string
  } = {}
): MutationValueMemberSpec<TValue> => ({
  kind: 'field',
  ...(input.at === undefined ? {} : { at: input.at })
})

export const record = <TValue,>(
  input: {
    at?: string
  } = {}
): MutationRecordMemberSpec<TValue> => ({
  kind: 'record',
  ...(input.at === undefined ? {} : { at: input.at })
})

export const keyed = <TKey extends string, TValue>(
  input: {
    at?: string
  } = {}
): MutationKeyedMemberSpec<TKey, TValue> => ({
  kind: 'keyed',
  ...(input.at === undefined ? {} : { at: input.at })
})

export const singleton = <Doc, Entity>() => <
  const TMembers extends Readonly<Record<string, MutationMemberSpec>>,
  const TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>>> | undefined = undefined,
  const TTree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'singleton', unknown, string>>> | undefined = undefined,
  const TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>> = Readonly<Record<string, readonly MutationChangeSelector[]>>
>(
  input: {
    access: FamilyAccess<Doc, Entity>
    members: TMembers
    changes?: MutationFamilyChanges<TMembers>
    ordered?: TOrdered
    tree?: TTree
  }
): MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree> => ({
  kind: 'singleton',
  ...input
}) as MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree>

export const mapFamily = <Doc, Id extends string, Entity>() => <
  const TMembers extends Readonly<Record<string, MutationMemberSpec>>,
  const TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'map', unknown, string>>> | undefined = undefined,
  const TTree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'map', unknown, string>>> | undefined = undefined,
  const TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>> = Readonly<Record<string, readonly MutationChangeSelector[]>>
>(
  input: {
    access: FamilyAccess<Doc, Entity>
    members: TMembers
    changes?: MutationFamilyChanges<TMembers>
    ordered?: TOrdered
    tree?: TTree
  }
): MutationCollectionFamilySpec<Doc, 'map', Id, Entity, TMembers, TChanges, TOrdered, TTree> => ({
  kind: 'map',
  ...input
}) as MutationCollectionFamilySpec<Doc, 'map', Id, Entity, TMembers, TChanges, TOrdered, TTree>

export const tableFamily = <Doc, Id extends string, Entity>() => <
  const TMembers extends Readonly<Record<string, MutationMemberSpec>>,
  const TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<Doc, 'table', unknown, string>>> | undefined = undefined,
  const TTree extends Readonly<Record<string, MutationTreeFamilySpec<Doc, 'table', unknown, string>>> | undefined = undefined,
  const TChanges extends Readonly<Record<string, readonly MutationChangeSelector[]>> = Readonly<Record<string, readonly MutationChangeSelector[]>>
>(
  input: {
    access: FamilyAccess<Doc, Entity>
    members: TMembers
    changes?: MutationFamilyChanges<TMembers>
    ordered?: TOrdered
    tree?: TTree
  }
): MutationCollectionFamilySpec<Doc, 'table', Id, Entity, TMembers, TChanges, TOrdered, TTree> => ({
  kind: 'table',
  ...input
}) as MutationCollectionFamilySpec<Doc, 'table', Id, Entity, TMembers, TChanges, TOrdered, TTree>

export const ordered = <
  Item
>() => <
  Spec extends MutationOrderedFamilySpec<any, any, Item, string>
>(
  spec: Spec
): Spec => spec

export const tree = <
  Value
>() => <
  Spec extends MutationTreeFamilySpec<any, any, Value, string>
>(
  spec: Spec
): Spec => spec

export type MutationUnset = {
  readonly kind: 'mutation.unset'
}

const MUTATION_UNSET: MutationUnset = Object.freeze({
  kind: 'mutation.unset'
})

export const unset = (): MutationUnset => MUTATION_UNSET

const isUnset = (
  value: unknown
): value is MutationUnset => value === MUTATION_UNSET

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

type FamilyOrderedOf<
  TFamily
> = TFamily extends {
  ordered?: infer TOrdered
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

type PatchValueFromMember<
  TMember
> = TMember extends MutationValueMemberSpec<infer TValue>
  ? TValue | MutationUnset
  : TMember extends MutationRecordMemberSpec<infer TValue>
    ? Partial<TValue> | MutationUnset
    : TMember extends MutationKeyedMemberSpec<infer TKey, infer TValue>
      ? Readonly<Partial<Record<TKey, TValue | MutationUnset>>> | MutationUnset
    : never

type MutationPatchOfMembers<
  TMembers extends Readonly<Record<string, MutationMemberSpec>>
> = Partial<{
  [K in keyof TMembers]: PatchValueFromMember<TMembers[K]>
}>

type KeyedWriterApi<
  TKey extends string,
  TValue,
  Tag extends string
> = {
  set(
    key: TKey,
    value: TValue,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  remove(
    key: TKey,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
}

type OrderedWriterApi<
  Item,
  Tag extends string
> = {
  insert(
    value: Item,
    to?: MutationOrderedAnchor,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  move(
    itemId: string,
    to?: MutationOrderedAnchor,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  splice(
    itemIds: readonly string[],
    to?: MutationOrderedAnchor,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  patch(
    itemId: string,
    patch: unknown,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  delete(
    itemId: string,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
}

type TreeWriterApi<
  Value,
  Tag extends string
> = {
  insert(
    nodeId: string,
    parentId?: string,
    index?: number,
    value?: Value,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  move(
    nodeId: string,
    parentId?: string,
    index?: number,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  delete(
    nodeId: string,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  restore(
    snapshot: MutationTreeSubtreeSnapshot<Value>,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
  patch(
    nodeId: string,
    patch: unknown,
    tags?: readonly Tag[],
    metadata?: {
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  ): void
}

type FamilyStructuresWriter<
  TFamily,
  Tag extends string
> = (
  TFamily extends {
    kind: 'singleton'
    members: infer TMembers
  }
    ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
      ? {
          [K in keyof TMembers as TMembers[K] extends MutationKeyedMemberSpec
            ? K
            : never]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, infer TValue>
              ? () => KeyedWriterApi<TKey, TValue, Tag>
              : never
        }
      : {}
    : TFamily extends {
        members: infer TMembers
      }
      ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
        ? {
            [K in keyof TMembers as TMembers[K] extends MutationKeyedMemberSpec
              ? K
              : never]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, infer TValue>
                ? (id: Extract<FamilyId<TFamily>, string>) => KeyedWriterApi<TKey, TValue, Tag>
                : never
          }
        : {}
      : {}
) & (
  TFamily extends {
    kind: 'singleton'
    ordered?: infer TOrdered
  }
    ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
      ? {
          [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
            ? () => OrderedWriterApi<TItem, Tag>
            : never
        }
      : {}
    : TFamily extends {
        ordered?: infer TOrdered
      }
      ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
        ? {
            [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
              ? (key: string) => OrderedWriterApi<TItem, Tag>
              : never
          }
        : {}
      : {}
) & (
  TFamily extends {
    kind: 'singleton'
    tree?: infer TTree
  }
    ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
      ? {
          [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
            ? () => TreeWriterApi<TValue, Tag>
            : never
        }
      : {}
    : TFamily extends {
        tree?: infer TTree
      }
      ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
        ? {
            [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
              ? (key: string) => TreeWriterApi<TValue, Tag>
              : never
          }
        : {}
      : {}
)

type FamilyWriter<
  TFamily,
  Tag extends string
> = (
  TFamily extends {
    kind: 'singleton'
  }
    ? {
        create(
          value: FamilyEntity<TFamily>,
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
        patch(
          writes: MutationPatchOfMembers<FamilyMembersOf<TFamily>> | Readonly<Record<string, unknown>>,
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
        delete(
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
      }
    : {
        create(
          value: FamilyEntity<TFamily>,
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
        patch(
          id: Extract<FamilyId<TFamily>, string>,
          writes: MutationPatchOfMembers<FamilyMembersOf<TFamily>> | Readonly<Record<string, unknown>>,
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
        patchMany(
          updates: readonly {
            id: Extract<FamilyId<TFamily>, string>
            writes: MutationPatchOfMembers<FamilyMembersOf<TFamily>> | Readonly<Record<string, unknown>>
          }[],
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
        delete(
          id: Extract<FamilyId<TFamily>, string>,
          tags?: readonly Tag[],
          metadata?: {
            delta?: MutationDeltaInput
            footprint?: readonly MutationFootprint[]
          }
        ): void
      }
) & FamilyStructuresWriter<TFamily, Tag>

export type MutationWriter<
  TModel extends MutationModelDefinition<any>,
  Tag extends string = string
> = {
  [K in keyof TModel]: FamilyWriter<TModel[K], Tag>
} & {
  signal(
    delta: MutationDeltaInput,
    tags?: readonly Tag[],
    metadata?: {
      footprint?: readonly MutationFootprint[]
    }
  ): void
}

type OrderedReaderApi<Item> = {
  items(): readonly Item[]
}

type KeyedReaderApi<TKey extends string, TValue> = {
  get(key: TKey): TValue | undefined
  has(key: TKey): boolean
  keys(): readonly TKey[]
  entries(): readonly (readonly [TKey, TValue])[]
}

type TreeReaderApi<Value> = {
  snapshot(): MutationTreeSnapshot<Value>
}

type FamilyStructuresReader<TFamily> = (
  TFamily extends {
    kind: 'singleton'
    members: infer TMembers
  }
    ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
      ? {
          [K in keyof TMembers as TMembers[K] extends MutationKeyedMemberSpec
            ? K
            : never]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, infer TValue>
              ? () => KeyedReaderApi<TKey, TValue>
              : never
        }
      : {}
    : TFamily extends {
        members: infer TMembers
      }
      ? TMembers extends Readonly<Record<string, MutationMemberSpec>>
        ? {
            [K in keyof TMembers as TMembers[K] extends MutationKeyedMemberSpec
              ? K
              : never]: TMembers[K] extends MutationKeyedMemberSpec<infer TKey, infer TValue>
                ? (id: Extract<FamilyId<TFamily>, string>) => KeyedReaderApi<TKey, TValue>
                : never
          }
        : {}
      : {}
) & (
  TFamily extends {
    kind: 'singleton'
    ordered?: infer TOrdered
  }
    ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
      ? {
          [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
            ? () => OrderedReaderApi<TItem>
            : never
        }
      : {}
    : TFamily extends {
        ordered?: infer TOrdered
      }
      ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
        ? {
            [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
              ? (key: Extract<FamilyId<TFamily>, string>) => OrderedReaderApi<TItem>
              : never
          }
        : {}
      : {}
) & (
  TFamily extends {
    kind: 'singleton'
    tree?: infer TTree
  }
    ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
      ? {
          [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
            ? () => TreeReaderApi<TValue>
            : never
        }
      : {}
    : TFamily extends {
        tree?: infer TTree
      }
      ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
        ? {
            [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
              ? (key: Extract<FamilyId<TFamily>, string>) => TreeReaderApi<TValue>
              : never
          }
        : {}
      : {}
)

type FamilyReader<TFamily> = (
  TFamily extends {
    kind: 'singleton'
  }
    ? {
        get(): FamilyEntity<TFamily>
      }
    : {
        ids(): readonly Extract<FamilyId<TFamily>, string>[]
        list(): readonly FamilyEntity<TFamily>[]
        get(id: Extract<FamilyId<TFamily>, string>): FamilyEntity<TFamily> | undefined
        require(id: Extract<FamilyId<TFamily>, string>): FamilyEntity<TFamily>
        has(id: Extract<FamilyId<TFamily>, string>): boolean
      }
) & FamilyStructuresReader<TFamily>

export type MutationReader<
  TModel extends MutationModelDefinition<any>
> = {
  [K in keyof TModel]: FamilyReader<TModel[K]>
}

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
      [K in keyof FamilyOrderedOf<TFamily>]: {
        changed(): boolean
      }
    } & {
      [K in keyof FamilyTreeOf<TFamily>]: {
        changed(): boolean
      }
    }
  : {
      [K in keyof FamilyOrderedOf<TFamily>]: TouchedView<Extract<FamilyId<TFamily>, string>>
    } & {
      [K in keyof FamilyTreeOf<TFamily>]: TouchedView<Extract<FamilyId<TFamily>, string>>
    }

type FamilyDelta<
  TFamily
> = TFamily extends {
  kind: 'singleton'
}
  ? {
      [K in keyof FamilyChangesOf<TFamily>]: FamilyChangeDeltaEntry<TFamily, K>
    } & FamilyStructureDelta<TFamily>
  : {
      create: TouchedView<Extract<FamilyId<TFamily>, string>>
      delete: TouchedView<Extract<FamilyId<TFamily>, string>>
      touchedIds(): ReadonlySet<Extract<FamilyId<TFamily>, string>> | 'all'
    } & {
      [K in keyof FamilyChangesOf<TFamily>]: FamilyChangeDeltaEntry<TFamily, K>
    } & FamilyStructureDelta<TFamily>

export type MutationDeltaOf<
  TModel extends MutationModelDefinition<any>
> = MutationDelta & {
  raw: MutationDelta
} & {
  [K in keyof TModel]: FamilyDelta<TModel[K]>
}

const createSelectorApi = <
  TMembers extends Readonly<Record<string, MutationMemberSpec>>
>(): SelectorApi<TMembers> => ({
  value: (key) => ({
    kind: 'field',
    member: key
  }),
  record: (key) => ({
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
  keyed: (key) => ({
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
  ordered: Readonly<Record<string, string>>
  tree: Readonly<Record<string, string>>
}

type CompiledModel<
  Doc
> = {
  registry: MutationRegistry<Doc>
  entities: ReadonlyMap<string, CompiledEntitySpec>
  families: readonly CompiledFamily[]
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
  const entity: Record<string, NonNullable<MutationRegistry<Doc>['entity']>[string]> = {}
  const orderedRegistry: Record<string, NonNullable<MutationRegistry<Doc>['ordered']>[string]> = {}
  const treeRegistry: Record<string, NonNullable<MutationRegistry<Doc>['tree']>[string]> = {}
  const families: CompiledFamily[] = []

  Object.entries(model).forEach(([familyName, family]) => {
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
      ordered: Object.fromEntries(
        Object.entries(family.ordered ?? {}).map(([name, spec]) => [
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

    Object.entries(family.ordered ?? {}).forEach(([name, spec]) => {
      const type = `${familyName}.${name}`
      if (family.kind === 'singleton') {
        const orderedSpec = spec as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>
        orderedRegistry[type] = {
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
        }
        return
      }

      const orderedSpec = spec as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>
      orderedRegistry[type] = {
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
      }
    })

    Object.entries(family.tree ?? {}).forEach(([name, spec]) => {
      const type = `${familyName}.${name}`
      if (family.kind === 'singleton') {
        const treeSpec = spec as MutationTreeFamilySpec<Doc, 'singleton', unknown, string>
        treeRegistry[type] = {
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
        }
        return
      }

      const treeSpec = spec as MutationTreeFamilySpec<Doc, 'map' | 'table', unknown, string>
      treeRegistry[type] = {
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
      }
    })
  })

  const compiledEntities = new Map<string, CompiledEntitySpec>()
  compileEntities(entity).forEach((spec, family) => {
    const familySpec = model[family as keyof TModel]
    compiledEntities.set(family, {
      ...spec,
      access: {
        read: familySpec.access.read as (document: unknown) => unknown,
        write: familySpec.access.write as (document: unknown, next: unknown) => unknown
      }
    })
  })

  return {
    registry: {
      entity,
      ...(Object.keys(orderedRegistry).length === 0
        ? {}
        : { ordered: orderedRegistry }),
      ...(Object.keys(treeRegistry).length === 0
        ? {}
        : { tree: treeRegistry })
    },
    entities: compiledEntities,
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
    if (isUnset(value)) {
      writes[base] = undefined
      return
    }
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
    if (isUnset(value)) {
      writes[base] = undefined
      return
    }
    if (
      typeof value !== 'object'
      || value === null
      || Array.isArray(value)
    ) {
      writes[base] = value
      return
    }

    Object.entries(value).forEach(([key, nested]) => {
      writes[`${base}.${key}`] = isUnset(nested)
        ? undefined
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
      writes[path] = isUnset(value)
        ? undefined
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
  const TModel extends MutationModelDefinition<Doc>,
  Tag extends string = string
>(
  model: TModel,
  base: MutationProgramWriter<Tag>
): MutationWriter<TModel, Tag> => {
  const result: Record<string, unknown> = {}

  Object.entries(model).forEach(([familyName, family]) => {
    const familyWriter: Record<string, unknown> = {}

    familyWriter.create = (
      value: unknown,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ) => {
      base.entity.create({
        kind: 'entity',
        type: familyName,
        id: family.kind === 'singleton'
          ? familyName
          : String((value as {
              id?: unknown
            }).id)
      }, value, tags, metadata)
    }

    if (family.kind === 'singleton') {
      familyWriter.patch = (
        writes: Readonly<Record<string, unknown>>,
        tags?: readonly Tag[],
        metadata?: {
          delta?: MutationDeltaInput
          footprint?: readonly MutationFootprint[]
        }
      ) => {
        base.entity.patch(
          {
            kind: 'entity',
            type: familyName,
            id: familyName
          },
          lowerPatchWrites(family.members, writes),
          tags,
          metadata
        )
      }
      familyWriter.delete = (
        tags?: readonly Tag[],
        metadata?: {
          delta?: MutationDeltaInput
          footprint?: readonly MutationFootprint[]
        }
      ) => {
        base.entity.delete({
          kind: 'entity',
          type: familyName,
          id: familyName
        }, tags, metadata)
      }
    } else {
      familyWriter.patch = (
        id: string,
        writes: Readonly<Record<string, unknown>>,
        tags?: readonly Tag[],
        metadata?: {
          delta?: MutationDeltaInput
          footprint?: readonly MutationFootprint[]
        }
      ) => {
        base.entity.patch(
          {
            kind: 'entity',
            type: familyName,
            id
          },
          lowerPatchWrites(family.members, writes),
          tags,
          metadata
        )
      }
      familyWriter.patchMany = (
        updates: readonly {
          id: string
          writes: Readonly<Record<string, unknown>>
        }[],
        tags?: readonly Tag[],
        metadata?: {
          delta?: MutationDeltaInput
          footprint?: readonly MutationFootprint[]
        }
      ) => {
        base.entity.patchMany(
          familyName,
          updates.map((update) => ({
            id: update.id,
            writes: lowerPatchWrites(family.members, update.writes)
          })),
          tags,
          metadata
        )
      }
      familyWriter.delete = (
        id: string,
        tags?: readonly Tag[],
        metadata?: {
          delta?: MutationDeltaInput
          footprint?: readonly MutationFootprint[]
        }
      ) => {
        base.entity.delete({
          kind: 'entity',
          type: familyName,
          id
        }, tags, metadata)
      }
    }

    Object.entries(family.members).forEach(([name, member]) => {
      if (member.kind !== 'keyed') {
        return
      }

      const path = member.at ?? name
      familyWriter[name] = family.kind === 'singleton'
        ? () => ({
            set: (key: string, value: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id: familyName
            }, {
              [`${path}.${key}`]: value
            }, tags, metadata),
            remove: (key: string, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id: familyName
            }, {
              [`${path}.${key}`]: undefined
            }, tags, metadata)
          })
        : (id: string) => ({
            set: (key: string, value: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id
            }, {
              [`${path}.${key}`]: value
            }, tags, metadata),
            remove: (key: string, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id
            }, {
              [`${path}.${key}`]: undefined
            }, tags, metadata)
          })
    })

    Object.keys(family.ordered ?? {}).forEach((name) => {
      const type = `${familyName}.${name}`
      familyWriter[name] = family.kind === 'singleton'
        ? () => ({
            insert: (value: unknown, to?: MutationOrderedAnchor, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.insert({
              kind: 'ordered',
              type
            }, (family.ordered?.[name] as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>).identify(value), value, to ?? {
              kind: 'end'
            }, tags, metadata),
            move: (itemId: string, to?: MutationOrderedAnchor, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.move({
              kind: 'ordered',
              type
            }, itemId, to ?? {
              kind: 'end'
            }, tags, metadata),
            splice: (itemIds: readonly string[], to?: MutationOrderedAnchor, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.splice({
              kind: 'ordered',
              type
            }, itemIds, to ?? {
              kind: 'end'
            }, tags, metadata),
            patch: (itemId: string, patch: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.patch({
              kind: 'ordered',
              type
            }, itemId, patch, tags, metadata),
            delete: (itemId: string, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.delete({
              kind: 'ordered',
              type
            }, itemId, tags, metadata)
          })
        : (key: string) => ({
            insert: (value: unknown, to?: MutationOrderedAnchor, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.insert({
              kind: 'ordered',
              type,
              key
            }, (family.ordered?.[name] as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>).identify(value), value, to ?? {
              kind: 'end'
            }, tags, metadata),
            move: (itemId: string, to?: MutationOrderedAnchor, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.move({
              kind: 'ordered',
              type,
              key
            }, itemId, to ?? {
              kind: 'end'
            }, tags, metadata),
            splice: (itemIds: readonly string[], to?: MutationOrderedAnchor, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.splice({
              kind: 'ordered',
              type,
              key
            }, itemIds, to ?? {
              kind: 'end'
            }, tags, metadata),
            patch: (itemId: string, patch: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.patch({
              kind: 'ordered',
              type,
              key
            }, itemId, patch, tags, metadata),
            delete: (itemId: string, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.ordered.delete({
              kind: 'ordered',
              type,
              key
            }, itemId, tags, metadata)
          })
    })

    Object.keys(family.tree ?? {}).forEach((name) => {
      const type = `${familyName}.${name}`
      familyWriter[name] = family.kind === 'singleton'
        ? () => ({
            insert: (nodeId: string, parentId?: string, index?: number, value?: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.insert({
              kind: 'tree',
              type
            }, nodeId, parentId, index, value, tags, metadata),
            move: (nodeId: string, parentId?: string, index?: number, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.move({
              kind: 'tree',
              type
            }, nodeId, parentId, index, tags, metadata),
            delete: (nodeId: string, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.delete({
              kind: 'tree',
              type
            }, nodeId, tags, metadata),
            restore: (snapshot: MutationTreeSubtreeSnapshot, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.restore({
              kind: 'tree',
              type
            }, snapshot, tags, metadata),
            patch: (nodeId: string, patch: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.patch({
              kind: 'tree',
              type
            }, nodeId, patch, tags, metadata)
          })
        : (key: string) => ({
            insert: (nodeId: string, parentId?: string, index?: number, value?: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.insert({
              kind: 'tree',
              type,
              key
            }, nodeId, parentId, index, value, tags, metadata),
            move: (nodeId: string, parentId?: string, index?: number, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.move({
              kind: 'tree',
              type,
              key
            }, nodeId, parentId, index, tags, metadata),
            delete: (nodeId: string, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.delete({
              kind: 'tree',
              type,
              key
            }, nodeId, tags, metadata),
            restore: (snapshot: MutationTreeSubtreeSnapshot, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.restore({
              kind: 'tree',
              type,
              key
            }, snapshot, tags, metadata),
            patch: (nodeId: string, patch: unknown, tags?: readonly Tag[], metadata?: {
              delta?: MutationDeltaInput
              footprint?: readonly MutationFootprint[]
            }) => base.tree.patch({
              kind: 'tree',
              type,
              key
            }, nodeId, patch, tags, metadata)
          })
    })

    result[familyName] = familyWriter
  })

  result.signal = (delta: MutationDeltaInput, tags?: readonly Tag[], metadata?: {
    footprint?: readonly MutationFootprint[]
  }) => base.signal(delta, tags, metadata)

  return result as MutationWriter<TModel, Tag>
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

  Object.entries(model).forEach(([familyName, family]) => {
    const familyReader: Record<string, unknown> = {}
    const readFamily = () => readCollection(
      family.access.read(readDocument()),
      familyName
    )

    if (family.kind === 'singleton') {
      familyReader.get = () => family.access.read(readDocument()) as unknown
    } else {
      familyReader.ids = () => Object.keys(readFamily())
      familyReader.list = () => Object.values(readFamily())
      familyReader.get = (id: string) => readFamily()[id]
      familyReader.require = (id: string) => {
        const value = readFamily()[id]
        if (value === undefined) {
          throw new Error(`Mutation reader family "${familyName}" cannot find entity "${id}".`)
        }
        return value
      }
      familyReader.has = (id: string) => readFamily()[id] !== undefined
    }

    Object.entries(family.members).forEach(([name, member]) => {
      if (member.kind !== 'keyed') {
        return
      }

      const path = member.at ?? name
      const createKeyedReader = (value: unknown) => {
        const collection = readKeyedCollection(value, familyName, name)
        return {
          get: (key: string) => collection[key],
          has: (key: string) => Object.prototype.hasOwnProperty.call(collection, key),
          keys: () => Object.keys(collection),
          entries: () => Object.entries(collection) as readonly (readonly [string, unknown])[]
        }
      }

      familyReader[name] = family.kind === 'singleton'
        ? () => createKeyedReader(
            (family.access.read(readDocument()) as Record<string, unknown> | undefined)?.[path]
          )
        : (id: string) => createKeyedReader(
            (readFamily()[id] as Record<string, unknown> | undefined)?.[path]
          )
    })

    Object.entries(family.ordered ?? {}).forEach(([name, spec]) => {
      familyReader[name] = family.kind === 'singleton'
        ? () => ({
            items: () => (
              spec as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>
            ).read(readDocument())
          })
        : (key: string) => ({
            items: () => (
              spec as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>
            ).read(readDocument(), key)
          })
    })

    Object.entries(family.tree ?? {}).forEach(([name, spec]) => {
      familyReader[name] = family.kind === 'singleton'
        ? () => ({
            snapshot: () => (
              spec as MutationTreeFamilySpec<Doc, 'singleton', unknown, string>
            ).read(readDocument())
          })
        : (key: string) => ({
            snapshot: () => (
              spec as MutationTreeFamilySpec<Doc, 'map' | 'table', unknown, string>
            ).read(readDocument(), key)
          })
    })

    result[familyName] = familyReader
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

  const compiled = compileMutationModel(model)
  const result: Record<string, unknown> = {
    ...(normalized as unknown as Record<string, unknown>),
    raw: normalized
  }

  compiled.families.forEach((family) => {
    if (family.kind === 'singleton') {
      const familyDelta = Object.fromEntries(
        family.changeKeys.map((key) => {
          const member = family.members[key]
          return [
            key,
            member?.kind === 'keyed'
              ? createSingletonKeyedTouchedView(
                  normalized,
                  `${family.name}.${key}`,
                  member.at ?? key
                )
              : {
                  changed: () => normalized.reset === true || normalized.changed(`${family.name}.${key}`)
                }
          ]
        })
      ) as Record<string, unknown>

      Object.entries(family.ordered).forEach(([name, emits]) => {
        familyDelta[name] = {
          changed: () => normalized.reset === true || normalized.has(`${family.name}.${emits}`)
        }
      })

      Object.entries(family.tree).forEach(([name, emits]) => {
        familyDelta[name] = {
          changed: () => normalized.reset === true || normalized.has(`${family.name}.${emits}`)
        }
      })

      result[family.name] = familyDelta
      return
    }

    const familyKeys = [
      `${family.name}.create`,
      `${family.name}.delete`,
      ...family.changeKeys.map((key) => `${family.name}.${key}`),
      ...Object.values(family.ordered).map((emits) => `${family.name}.${emits}`),
      ...Object.values(family.tree).map((emits) => `${family.name}.${emits}`)
    ]
    const familyDelta: Record<string, unknown> = {
      create: createTouchedView(normalized, `${family.name}.create`),
      delete: createTouchedView(normalized, `${family.name}.delete`),
      touchedIds: () => readTouchedIds(normalized, familyKeys)
    }

    family.changeKeys.forEach((key) => {
      const member = family.members[key]
      familyDelta[key] = member?.kind === 'keyed'
        ? createCollectionKeyedTouchedView(
            normalized,
            `${family.name}.${key}`,
            member.at ?? key
          )
        : createTouchedView(normalized, `${family.name}.${key}`)
    })

    Object.entries(family.ordered).forEach(([name, emits]) => {
      familyDelta[name] = createTouchedView(normalized, `${family.name}.${emits}`)
    })

    Object.entries(family.tree).forEach(([name, emits]) => {
      familyDelta[name] = createTouchedView(normalized, `${family.name}.${emits}`)
    })

    result[family.name] = familyDelta
  })

  const typed = result as MutationDeltaOf<TModel>
  const nextModelCache = modelCache ?? new WeakMap<MutationDelta, MutationDeltaOf<any>>()
  if (!modelCache) {
    DELTA_CACHE.set(model as object, nextModelCache)
  }
  nextModelCache.set(normalized, typed)
  return typed
}

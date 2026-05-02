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
  MutationTreeSnapshot,
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

export const defineMutationSchema = <
  Doc
>() => <
  const TDefinition extends MutationSchemaDefinition<Doc>
>(
  definition: TDefinition
): TDefinition => definition

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

export const singleton = <Doc, Entity>() => <
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
): MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree> => ({
  kind: 'singleton',
  ...input
}) as MutationSingletonFamilySpec<Doc, Entity, TMembers, TChanges, TOrdered, TTree>

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
export const sequence = <
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

type KeyedWriterApi<
  TKey extends string,
  TValue
> = {
  set(
    key: TKey,
    value: TValue
  ): void
  remove(
    key: TKey
  ): void
}

type OrderedWriterApi<
  Item
> = {
  insert(
    value: Item,
    to?: MutationOrderedAnchor
  ): void
  move(
    itemId: string,
    to?: MutationOrderedAnchor
  ): void
  splice(
    itemIds: readonly string[],
    to?: MutationOrderedAnchor
  ): void
  patch(
    itemId: string,
    patch: unknown
  ): void
  delete(
    itemId: string
  ): void
}

type TreeWriterApi<
  Value
> = {
  insert(
    nodeId: string,
    parentId?: string,
    index?: number,
    value?: Value
  ): void
  move(
    nodeId: string,
    parentId?: string,
    index?: number
  ): void
  delete(
    nodeId: string
  ): void
  patch(
    nodeId: string,
    patch: unknown
  ): void
}

type FamilyStructuresWriter<
  TFamily
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
              ? () => KeyedWriterApi<TKey, TValue>
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
                ? (id: Extract<FamilyId<TFamily>, string>) => KeyedWriterApi<TKey, TValue>
                : never
          }
        : {}
      : {}
) & (
  TFamily extends {
    kind: 'singleton'
    sequence?: infer TOrdered
  }
    ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
      ? {
          [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
            ? () => OrderedWriterApi<TItem>
            : never
        }
      : {}
    : TFamily extends {
        sequence?: infer TOrdered
      }
      ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
        ? {
            [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
              ? (key: string) => OrderedWriterApi<TItem>
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
            ? () => TreeWriterApi<TValue>
            : never
        }
      : {}
    : TFamily extends {
        tree?: infer TTree
      }
      ? TTree extends Readonly<Record<string, MutationTreeFamilySpec<any, any, unknown, string>>>
        ? {
            [K in keyof TTree]: TTree[K] extends MutationTreeFamilySpec<any, any, infer TValue, string>
              ? (key: string) => TreeWriterApi<TValue>
              : never
          }
        : {}
      : {}
)

type FamilyWriter<
  TFamily
> = (
  TFamily extends {
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
      }
    : {
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
      }
) & FamilyStructuresWriter<TFamily>

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
    sequence?: infer TOrdered
  }
    ? TOrdered extends Readonly<Record<string, MutationOrderedFamilySpec<any, any, unknown, string>>>
      ? {
          [K in keyof TOrdered]: TOrdered[K] extends MutationOrderedFamilySpec<any, any, infer TItem, string>
            ? () => OrderedReaderApi<TItem>
            : never
        }
      : {}
    : TFamily extends {
        sequence?: infer TOrdered
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
  ? {
      changed(): boolean
    } & {
      [K in keyof FamilyChangesOf<TFamily>]: FamilyChangeDeltaEntry<TFamily, K>
    } & FamilyStructureDelta<TFamily>
  : {
      create: TouchedView<Extract<FamilyId<TFamily>, string>>
      delete: TouchedView<Extract<FamilyId<TFamily>, string>>
      changed(id?: Extract<FamilyId<TFamily>, string>): boolean
      touchedIds(): ReadonlySet<Extract<FamilyId<TFamily>, string>> | 'all'
    } & {
      [K in keyof FamilyChangesOf<TFamily>]: FamilyChangeDeltaEntry<TFamily, K>
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
  base: MutationProgramWriter
): MutationWriter<TModel> => {
  const result: Record<string, unknown> = {}

  forEachMutationFamily(model, (familyName, family) => {
    const familyWriter: Record<string, unknown> = {}

    familyWriter.create = (
      value: unknown
    ) => {
      base.entity.create({
        kind: 'entity',
        type: familyName,
        id: family.kind === 'singleton'
          ? familyName
          : String((value as {
              id?: unknown
            }).id)
      }, value)
    }

    if (family.kind === 'singleton') {
      familyWriter.patch = (
        writes: Readonly<Record<string, unknown>>
      ) => {
        base.entity.patch(
          {
            kind: 'entity',
            type: familyName,
            id: familyName
          },
          lowerPatchWrites(family.members, writes)
        )
      }
      familyWriter.delete = () => {
        base.entity.delete({
          kind: 'entity',
          type: familyName,
          id: familyName
        })
      }
    } else {
      familyWriter.patch = (
        id: string,
        writes: Readonly<Record<string, unknown>>
      ) => {
        base.entity.patch(
          {
            kind: 'entity',
            type: familyName,
            id
          },
          lowerPatchWrites(family.members, writes)
        )
      }
      familyWriter.delete = (id: string) => {
        base.entity.delete({
          kind: 'entity',
          type: familyName,
          id
        })
      }
    }

    Object.entries(family.members).forEach(([name, member]) => {
      if (member.kind !== 'keyed') {
        return
      }

      const path = member.at ?? name
      familyWriter[name] = family.kind === 'singleton'
        ? () => ({
            set: (key: string, value: unknown) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id: familyName
            }, {
              [`${path}.${key}`]: value
            }),
            remove: (key: string) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id: familyName
            }, {
              [`${path}.${key}`]: undefined
            })
          })
        : (id: string) => ({
            set: (key: string, value: unknown) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id
            }, {
              [`${path}.${key}`]: value
            }),
            remove: (key: string) => base.entity.patch({
              kind: 'entity',
              type: familyName,
              id
            }, {
              [`${path}.${key}`]: undefined
            })
          })
    })

    Object.keys(family.sequence ?? {}).forEach((name) => {
      const type = `${familyName}.${name}`
      familyWriter[name] = family.kind === 'singleton'
        ? () => ({
            insert: (value: unknown, to?: MutationOrderedAnchor) => base.ordered.insert({
              kind: 'ordered',
              type
            }, (family.sequence?.[name] as MutationOrderedFamilySpec<Doc, 'singleton', unknown, string>).identify(value), value, to ?? {
              kind: 'end'
            }),
            move: (itemId: string, to?: MutationOrderedAnchor) => base.ordered.move({
              kind: 'ordered',
              type
            }, itemId, to ?? {
              kind: 'end'
            }),
            splice: (itemIds: readonly string[], to?: MutationOrderedAnchor) => base.ordered.splice({
              kind: 'ordered',
              type
            }, itemIds, to ?? {
              kind: 'end'
            }),
            patch: (itemId: string, patch: unknown) => base.ordered.patch({
              kind: 'ordered',
              type
            }, itemId, patch),
            delete: (itemId: string) => base.ordered.delete({
              kind: 'ordered',
              type
            }, itemId)
          })
        : (key: string) => ({
            insert: (value: unknown, to?: MutationOrderedAnchor) => base.ordered.insert({
              kind: 'ordered',
              type,
              key
            }, (family.sequence?.[name] as MutationOrderedFamilySpec<Doc, 'map' | 'table', unknown, string>).identify(value), value, to ?? {
              kind: 'end'
            }),
            move: (itemId: string, to?: MutationOrderedAnchor) => base.ordered.move({
              kind: 'ordered',
              type,
              key
            }, itemId, to ?? {
              kind: 'end'
            }),
            splice: (itemIds: readonly string[], to?: MutationOrderedAnchor) => base.ordered.splice({
              kind: 'ordered',
              type,
              key
            }, itemIds, to ?? {
              kind: 'end'
            }),
            patch: (itemId: string, patch: unknown) => base.ordered.patch({
              kind: 'ordered',
              type,
              key
            }, itemId, patch),
            delete: (itemId: string) => base.ordered.delete({
              kind: 'ordered',
              type,
              key
            }, itemId)
          })
    })

    Object.keys(family.tree ?? {}).forEach((name) => {
      const type = `${familyName}.${name}`
      familyWriter[name] = family.kind === 'singleton'
        ? () => ({
            insert: (nodeId: string, parentId?: string, index?: number, value?: unknown) => base.tree.insert({
              kind: 'tree',
              type
            }, nodeId, parentId, index, value),
            move: (nodeId: string, parentId?: string, index?: number) => base.tree.move({
              kind: 'tree',
              type
            }, nodeId, parentId, index),
            delete: (nodeId: string) => base.tree.delete({
              kind: 'tree',
              type
            }, nodeId),
            patch: (nodeId: string, patch: unknown) => base.tree.patch({
              kind: 'tree',
              type
            }, nodeId, patch)
          })
        : (key: string) => ({
            insert: (nodeId: string, parentId?: string, index?: number, value?: unknown) => base.tree.insert({
              kind: 'tree',
              type,
              key
            }, nodeId, parentId, index, value),
            move: (nodeId: string, parentId?: string, index?: number) => base.tree.move({
              kind: 'tree',
              type,
              key
            }, nodeId, parentId, index),
            delete: (nodeId: string) => base.tree.delete({
              kind: 'tree',
              type,
              key
            }, nodeId),
            patch: (nodeId: string, patch: unknown) => base.tree.patch({
              kind: 'tree',
              type,
              key
            }, nodeId, patch)
          })
    })

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

  forEachMutationFamily(model, (familyName, family) => {
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

    Object.entries(family.sequence ?? {}).forEach(([name, spec]) => {
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

  const compiled = compileMutationModel(model)
  const result: Record<string, unknown> = {
    ...(normalized as unknown as Record<string, unknown>),
    raw: normalized
  }

  compiled.families.forEach((family) => {
    if (family.kind === 'singleton') {
      const familyKeys = [
        ...family.changeKeys.map((key) => `${family.name}.${key}`),
        ...Object.values(family.sequence).map((emits) => `${family.name}.${emits}`),
        ...Object.values(family.tree).map((emits) => `${family.name}.${emits}`)
      ]
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

      familyDelta.changed = () => normalized.reset === true || familyKeys.some((key) => normalized.has(key))

      Object.entries(family.sequence).forEach(([name, emits]) => {
        familyDelta[name] = {
          changed: () => normalized.reset === true || normalized.has(`${family.name}.${emits}`)
        }
      })

      Object.entries(family.tree).forEach(([name, emits]) => {
        familyDelta[name] = {
          changed: () => normalized.reset === true || normalized.has(`${family.name}.${emits}`)
        }
      })

      assignNested(result, family.name, familyDelta)
      return
    }

    const familyKeys = [
      `${family.name}.create`,
      `${family.name}.delete`,
      ...family.changeKeys.map((key) => `${family.name}.${key}`),
      ...Object.values(family.sequence).map((emits) => `${family.name}.${emits}`),
      ...Object.values(family.tree).map((emits) => `${family.name}.${emits}`)
    ]
    const familyDelta: Record<string, unknown> = {
      create: createTouchedView(normalized, `${family.name}.create`),
      delete: createTouchedView(normalized, `${family.name}.delete`),
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

    Object.entries(family.sequence).forEach(([name, emits]) => {
      familyDelta[name] = createTouchedView(normalized, `${family.name}.${emits}`)
    })

    Object.entries(family.tree).forEach(([name, emits]) => {
      familyDelta[name] = createTouchedView(normalized, `${family.name}.${emits}`)
    })

    assignNested(result, family.name, familyDelta)
  })

  const typed = freezeDeep(result) as MutationDeltaOf<TModel>
  const nextModelCache = modelCache ?? new WeakMap<MutationDelta, MutationDeltaOf<any>>()
  if (!modelCache) {
    DELTA_CACHE.set(model as object, nextModelCache)
  }
  nextModelCache.set(normalized, typed as MutationDeltaOf<any>)
  return typed
}

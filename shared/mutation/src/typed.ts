import type {
  MutationEntitySpec
} from './engine'
import {
  mergeMutationDeltas
} from './engine'
import type {
  MutationChange,
  MutationChangeInput,
  MutationDelta,
  MutationDeltaInput
} from './write'

const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as MutationDelta['changes']

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const hasChange = (
  changes: MutationDelta['changes'],
  key: string
): boolean => hasOwn(changes, key)

const readChange = (
  changes: MutationDelta['changes'],
  key: string
): MutationChange | undefined => changes[key]

export interface MutationPathCodec<TPath> {
  parse(path: string): TPath | undefined
  format(path: TPath): string
}

export interface MutationSchemaEntry<
  TId extends string = string,
  TPath = string
> {
  ids?: true
  paths?: MutationPathCodec<TPath>
}

export type MutationSchema = Readonly<Record<string, MutationSchemaEntry<any, any>>>
export type MutationSignalSchema = MutationSchema

export type MutationSchemaId<TEntry> = TEntry extends MutationSchemaEntry<infer TId, any>
  ? TId
  : string

export type MutationSchemaPath<TEntry> = TEntry extends MutationSchemaEntry<any, infer TPath>
  ? TPath
  : string

type MutationSchemaIdsEntry<
  TId extends string = string,
  TPath = string
> = MutationSchemaEntry<TId, TPath> & {
  ids: true
}

type SchemaKey<TSchema extends MutationSchema> = keyof TSchema & string

type SchemaIdKey<TSchema extends MutationSchema> = {
  [K in SchemaKey<TSchema>]:
    TSchema[K] extends {
      ids: true
    }
      ? K
      : TSchema[K] extends {
        paths: MutationPathCodec<any>
      }
        ? K
        : never
}[SchemaKey<TSchema>]

type SchemaPathKey<TSchema extends MutationSchema> = {
  [K in SchemaKey<TSchema>]:
    TSchema[K] extends {
      paths: MutationPathCodec<any>
    }
      ? K
      : never
}[SchemaKey<TSchema>]

type Simplify<T> = {
  [K in keyof T]: T[K]
}

type UnionToIntersection<T> = (
  T extends unknown
    ? (value: T) => void
    : never
) extends (value: infer I) => void
  ? I
  : never

type MergeSchemaShape<
  TBase extends Record<string, unknown>,
  TOverride extends Partial<Record<string, unknown>>
> = Simplify<{
  [K in keyof TBase | keyof TOverride]:
    K extends keyof TOverride
      ? K extends keyof TBase
        ? TBase[K] & TOverride[K]
        : TOverride[K]
      : K extends keyof TBase
        ? TBase[K]
        : never
}>

type MutationEntitySchemaOverride<
  TEntities extends Readonly<Record<string, MutationEntitySpec>>
> = Partial<Record<MutationEntitySchemaKey<TEntities>, MutationSchemaEntry<any, any>>>

type MutationEntityLifecycleKey<
  TEntities extends Readonly<Record<string, MutationEntitySpec>>
> = {
  [K in keyof TEntities & string]:
    TEntities[K]['kind'] extends 'singleton'
      ? never
      : `${K}.create` | `${K}.delete`
}[keyof TEntities & string]

type MutationEntityChangeSchemaRecord<
  TFamily extends string,
  TSpec extends MutationEntitySpec
> = TSpec['change'] extends Readonly<Record<string, readonly string[]>>
  ? {
      [K in keyof TSpec['change'] & string as `${TFamily}.${K}`]:
        TSpec['kind'] extends 'singleton'
          ? MutationSchemaEntry
          : MutationSchemaIdsEntry<string>
    }
  : {}

type MutationEntityDerivedSchema<
  TEntities extends Readonly<Record<string, MutationEntitySpec>>
> = Simplify<
  {
    [K in MutationEntityLifecycleKey<TEntities>]: MutationSchemaIdsEntry<string>
  } & UnionToIntersection<{
    [K in keyof TEntities & string]:
      MutationEntityChangeSchemaRecord<K, TEntities[K]>
  }[keyof TEntities & string]>
>

export type MutationEntitySchemaKey<
  TEntities extends Readonly<Record<string, MutationEntitySpec>>
> = keyof MutationEntityDerivedSchema<TEntities> & string

export type MutationEntityDerivedMutationSchema<
  TEntities extends Readonly<Record<string, MutationEntitySpec>>
> = MutationEntityDerivedSchema<TEntities>

export type MutationEntityMutationSchema<
  TEntities extends Readonly<Record<string, MutationEntitySpec>>,
  TEntries extends MutationEntitySchemaOverride<TEntities> = {},
  TSignals extends MutationSignalSchema = {}
> = MergeSchemaShape<
  MergeSchemaShape<
    MutationEntityDerivedSchema<TEntities>,
    TEntries
  >,
  TSignals
>

export type MutationSchemaPathRecord<
  TEntry extends MutationSchemaEntry<any, any>
> = Readonly<Record<
  MutationSchemaId<TEntry>,
  readonly MutationSchemaPath<TEntry>[] | 'all'
>> | 'all'

type MutationSchemaChangeObject<
  TEntry extends MutationSchemaEntry<any, any>
> = Simplify<{
  order?: true
} & (
  TEntry extends {
    ids: true
  }
    ? {
        ids?: readonly MutationSchemaId<TEntry>[] | 'all'
      }
    : {}
) & (
  TEntry extends {
    paths: MutationPathCodec<any>
  }
    ? {
        paths?: MutationSchemaPathRecord<TEntry>
      }
    : {}
)>

export type MutationSchemaChangeInput<
  TEntry extends MutationSchemaEntry<any, any>
> =
  | true
  | (TEntry extends {
      ids: true
    }
      ? readonly MutationSchemaId<TEntry>[]
      : never)
  | MutationSchemaChangeObject<TEntry>

export type MutationDeltaInputOf<
  TSchema extends MutationSchema
> = {
  reset?: true
  changes?: Partial<{
    [K in SchemaKey<TSchema>]: MutationSchemaChangeInput<TSchema[K]>
  }>
}

export interface MutationDeltaBuilder<
  TSchema extends MutationSchema
> {
  flag<TKey extends SchemaKey<TSchema>>(
    key: TKey
  ): MutationDeltaInputOf<Pick<TSchema, TKey>>
  ids<TKey extends SchemaIdKey<TSchema>>(
    key: TKey,
    ids: readonly MutationSchemaId<TSchema[TKey]>[]
  ): MutationDeltaInputOf<Pick<TSchema, TKey>>
  paths<TKey extends SchemaPathKey<TSchema>>(
    key: TKey,
    paths: MutationSchemaPathRecord<TSchema[TKey]>
  ): MutationDeltaInputOf<Pick<TSchema, TKey>>
  order<TKey extends SchemaKey<TSchema>>(
    key: TKey,
    ids?: readonly MutationSchemaId<TSchema[TKey]>[]
  ): MutationDeltaInputOf<Pick<TSchema, TKey>>
  change<TKey extends SchemaKey<TSchema>>(
    key: TKey,
    change: MutationSchemaChangeInput<TSchema[TKey]>
  ): MutationDeltaInputOf<Pick<TSchema, TKey>>
  merge(
    ...inputs: readonly (
      | MutationDelta
      | MutationDeltaInput
      | MutationDeltaInputOf<TSchema>
      | undefined
    )[]
  ): MutationDeltaInputOf<TSchema>
}

export interface TypedMutationDeltaContext<TSchema extends MutationSchema> {
  raw: MutationDelta
  schema: TSchema
  has<TKey extends keyof TSchema & string>(key: TKey): boolean
  any(keys: readonly (keyof TSchema & string)[]): boolean
  order<TKey extends keyof TSchema & string>(key: TKey): boolean
  ids<TKey extends keyof TSchema & string>(
    key: TKey
  ): readonly MutationSchemaId<TSchema[TKey]>[] | 'all' | undefined
  paths<TKey extends keyof TSchema & string>(
    key: TKey
  ): Readonly<Record<string, readonly MutationSchemaPath<TSchema[TKey]>[] | 'all'>> | 'all' | undefined
  pathsOf<TKey extends keyof TSchema & string>(
    key: TKey,
    id: MutationSchemaId<TSchema[TKey]>
  ): readonly MutationSchemaPath<TSchema[TKey]>[] | 'all' | undefined
  changed<TKey extends keyof TSchema & string>(
    key: TKey,
    id?: MutationSchemaId<TSchema[TKey]>
  ): boolean
  matches<TKey extends keyof TSchema & string>(
    key: TKey,
    id: MutationSchemaId<TSchema[TKey]>,
    predicate: (path: MutationSchemaPath<TSchema[TKey]>) => boolean
  ): boolean
  touchedIds<TKey extends keyof TSchema & string>(
    keys: readonly TKey[]
  ): ReadonlySet<MutationSchemaId<TSchema[TKey]>> | 'all'
}

type ParsedPaths = Readonly<Record<string, readonly unknown[] | 'all'>> | 'all' | undefined

const EMPTY_PARSED_PATHS = Object.freeze(
  Object.create(null)
) as Readonly<Record<string, readonly unknown[] | 'all'>>

const parsePathList = <TPath,>(
  values: readonly string[],
  codec: MutationPathCodec<TPath> | undefined
): readonly TPath[] => {
  if (!codec) {
    return values as unknown as readonly TPath[]
  }

  const parsed: TPath[] = []
  for (let index = 0; index < values.length; index += 1) {
    const value = codec.parse(values[index]!)
    if (value !== undefined) {
      parsed.push(value)
    }
  }
  return parsed
}

export const defineMutationSchema = <TSchema extends MutationSchema>(
  schema: TSchema
): TSchema => schema

const createSchemaEntry = (
  spec: MutationEntitySpec
): MutationSchemaEntry => spec.kind === 'singleton'
  ? {}
  : {
      ids: true
    }

export const defineEntityMutationSchema = <
  TEntities extends Readonly<Record<string, MutationEntitySpec>>,
  TEntries extends MutationEntitySchemaOverride<TEntities> = {},
  TSignals extends MutationSignalSchema = {}
>(input: {
  entities: TEntities
  entries?: TEntries
  signals?: TSignals
}): MutationEntityMutationSchema<TEntities, TEntries, TSignals> => {
  const schema: Record<string, MutationSchemaEntry<any, any>> = {}
  const entries = input.entries ?? {} as TEntries

  Object.entries(input.entities).forEach(([family, spec]) => {
    if (spec.kind !== 'singleton') {
      schema[`${family}.create`] = {
        ids: true
      }
      schema[`${family}.delete`] = {
        ids: true
      }
    }

    if (!spec.change || typeof spec.change === 'function') {
      return
    }

    Object.keys(spec.change).forEach((key) => {
      schema[`${family}.${key}`] = createSchemaEntry(spec)
    })
  })

  Object.entries(entries).forEach(([key, entry]) => {
    if (!entry) {
      return
    }

    schema[key] = {
      ...(schema[key] ?? {}),
      ...entry
    }
  })

  Object.entries(input.signals ?? {}).forEach(([key, entry]) => {
    schema[key] = entry
  })

  return defineMutationSchema(
    schema as MutationSchema
  ) as MutationEntityMutationSchema<TEntities, TEntries, TSignals>
}

const formatPathList = <TPath,>(
  values: readonly TPath[],
  codec: MutationPathCodec<TPath> | undefined
): readonly string[] => {
  if (!codec) {
    return values as unknown as readonly string[]
  }

  const formatted: string[] = []
  for (let index = 0; index < values.length; index += 1) {
    formatted.push(codec.format(values[index]!))
  }
  return formatted
}

const formatPathRecord = <TEntry extends MutationSchemaEntry<any, any>>(
  schema: TEntry,
  paths: MutationSchemaPathRecord<TEntry>
): MutationChange['paths'] => {
  if (paths === 'all') {
    return 'all'
  }

  const codec = schema.paths
  const formatted: Record<string, readonly string[] | 'all'> = {}
  Object.entries(paths as Readonly<Record<string, readonly unknown[] | 'all'>>).forEach(([id, value]) => {
    formatted[id] = value === 'all'
      ? 'all'
      : formatPathList(value as readonly MutationSchemaPath<TEntry>[], codec)
  })

  return formatted
}

const serializeMutationChange = (
  change: MutationChange
): MutationChangeInput => {
  const next: Record<string, unknown> = {}

  if (change.ids !== undefined) {
    next.ids = change.ids === 'all'
      ? 'all'
      : [...change.ids]
  }

  if (change.paths !== undefined) {
    if (change.paths === 'all') {
      next.paths = 'all'
    } else {
      const paths: Record<string, readonly string[] | 'all'> = {}
      Object.entries(change.paths).forEach(([id, value]) => {
        paths[id] = value === 'all'
          ? 'all'
          : [...value]
      })
      next.paths = paths
    }
  }

  if (change.order === true) {
    next.order = true
  }

  Object.keys(change).forEach((key) => {
    if (key === 'ids' || key === 'paths' || key === 'order') {
      return
    }

    next[key] = change[key]
  })

  return next
}

export const toMutationDeltaInput = (
  input?: MutationDelta | MutationDeltaInput
): MutationDeltaInput => {
  const delta = coerceMutationDelta(input)
  const changes: Record<string, MutationChangeInput> = {}

  for (const [key, change] of Object.entries(delta.changes)) {
    changes[key] = serializeMutationChange(change)
  }

  return {
    ...(delta.reset
      ? {
          reset: true
        }
      : {}),
    ...(Object.keys(changes).length > 0
      ? {
          changes
        }
      : {})
  }
}

const formatChangeInput = <TEntry extends MutationSchemaEntry<any, any>>(
  schema: TEntry,
  change: MutationSchemaChangeInput<TEntry>
): MutationChangeInput => {
  if (change === true || Array.isArray(change)) {
    return change
  }

  if (!('paths' in change) || change.paths === undefined) {
    return change
  }

  return {
    ...change,
    paths: formatPathRecord(schema, change.paths as MutationSchemaPathRecord<TEntry>)
  }
}

const singleDeltaInput = (
  key: string,
  change: MutationChangeInput
): MutationDeltaInput => ({
  changes: {
    [key]: change
  }
})

export const createDeltaBuilder = <
  TSchema extends MutationSchema
>(
  schema: TSchema
): MutationDeltaBuilder<TSchema> => ({
  flag: (key) => singleDeltaInput(key, true) as MutationDeltaInputOf<any>,
  ids: (key, ids) => singleDeltaInput(
    key,
    [...ids]
  ) as MutationDeltaInputOf<any>,
  paths: (key, paths) => singleDeltaInput(
    key,
    {
      paths: formatPathRecord(schema[key], paths)
    }
  ) as MutationDeltaInputOf<any>,
  order: (key, ids) => singleDeltaInput(
    key,
    {
      ...(ids?.length
        ? {
            ids: [...ids]
          }
        : {}),
      order: true
    }
  ) as MutationDeltaInputOf<any>,
  change: (key, change) => singleDeltaInput(
    key,
    formatChangeInput(schema[key], change)
  ) as MutationDeltaInputOf<any>,
  merge: (...inputs) => toMutationDeltaInput(
    inputs.reduce<MutationDelta | MutationDeltaInput | undefined>(
      (current, input) => mergeMutationDeltas(
        current,
        input as MutationDelta | MutationDeltaInput | undefined
      ),
      undefined
    )
  ) as MutationDeltaInputOf<any>
})

export const readMutationChangeIds = <TId extends string>(
  change: MutationChange | undefined
): readonly TId[] | 'all' | undefined => {
  if (!change) {
    return undefined
  }

  if (change.ids !== undefined) {
    return change.ids as readonly TId[] | 'all'
  }

  if (change.paths === 'all') {
    return 'all'
  }

  return change.paths
    ? Object.keys(change.paths) as TId[]
    : undefined
}

export const readMutationChangePaths = (
  change: MutationChange | undefined
): Readonly<Record<string, readonly string[] | 'all'>> | 'all' | undefined => (
  change?.paths
)

export const readMutationChangePathsOf = <TId extends string>(
  change: MutationChange | undefined,
  id: TId
): readonly string[] | 'all' | undefined => {
  const paths = readMutationChangePaths(change)
  if (paths === 'all') {
    return 'all'
  }

  return paths?.[id]
}

export const hasMutationChange = (
  delta: MutationDelta,
  key: string
): boolean => delta.reset === true
  || hasChange(delta.changes, key)

export const hasAnyMutationChange = (
  delta: MutationDelta,
  keys: readonly string[]
): boolean => keys.some((key) => hasMutationChange(delta, key))

export const collectMutationTouchedIds = <TId extends string>(
  delta: MutationDelta,
  keys: readonly string[]
): ReadonlySet<TId> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  const result = new Set<TId>()
  for (let index = 0; index < keys.length; index += 1) {
    const ids = readMutationChangeIds<TId>(readChange(delta.changes, keys[index]!))
    if (ids === 'all') {
      return 'all'
    }
    ids?.forEach((id) => {
      result.add(id)
    })
  }

  return result
}

const coerceMutationChange = (
  input: MutationChangeInput
): MutationChange => {
  if (input === true) {
    return {
      ids: 'all'
    }
  }

  if (Array.isArray(input)) {
    return {
      ids: input
    }
  }

  return {
    ...input
  }
}

export const coerceMutationDelta = (
  input?: MutationDelta | MutationDeltaInput
): MutationDelta => {
  if (!input) {
    return {
      changes: EMPTY_MUTATION_CHANGES
    }
  }

  const normalized: Record<string, MutationChange> = {}
  Object.entries(input.changes ?? {}).forEach(([key, change]) => {
    normalized[key] = coerceMutationChange(change)
  })

  return {
    ...(input.reset
      ? {
          reset: true
        }
      : {}),
    changes: Object.keys(normalized).length > 0
      ? normalized
      : EMPTY_MUTATION_CHANGES
  }
}

export const createTypedMutationDelta = <
  TSchema extends MutationSchema,
  TExtra extends object
>(input: {
  raw: MutationDelta | MutationDeltaInput
  schema: TSchema
  build: (context: TypedMutationDeltaContext<TSchema>) => TExtra
}): MutationDelta & {
  raw: MutationDelta
} & TExtra => {
  const raw = coerceMutationDelta(input.raw)
  const idsCache = new Map<string, readonly string[] | 'all' | undefined>()
  const pathsCache = new Map<string, ParsedPaths>()

  const context: TypedMutationDeltaContext<TSchema> = {
    raw,
    schema: input.schema,
    has: (key) => hasMutationChange(raw, key),
    any: (keys) => hasAnyMutationChange(raw, keys),
    order: (key) => raw.reset === true
      || readChange(raw.changes, key)?.order === true,
    ids: (key) => {
      if (!idsCache.has(key)) {
        idsCache.set(
          key,
          readMutationChangeIds(readChange(raw.changes, key))
        )
      }
      return idsCache.get(key) as readonly MutationSchemaId<TSchema[typeof key]>[] | 'all' | undefined
    },
    paths: (key) => {
      if (!pathsCache.has(key)) {
        const rawPaths = readMutationChangePaths(readChange(raw.changes, key))
        if (rawPaths === 'all') {
          pathsCache.set(key, 'all')
        } else if (!rawPaths) {
          pathsCache.set(key, undefined)
        } else {
          const codec = input.schema[key]?.paths
          const parsed: Record<string, readonly unknown[] | 'all'> = {}
          Object.entries(rawPaths).forEach(([id, value]) => {
            if (value === 'all') {
              parsed[id] = 'all'
              return
            }

            const next = parsePathList(value, codec)
            if (next.length > 0) {
              parsed[id] = next
            }
          })
          pathsCache.set(
            key,
            Object.keys(parsed).length > 0
              ? parsed
              : EMPTY_PARSED_PATHS
          )
        }
      }

      const parsed = pathsCache.get(key)
      if (parsed === EMPTY_PARSED_PATHS) {
        return undefined
      }
      return parsed as Readonly<Record<string, readonly MutationSchemaPath<TSchema[typeof key]>[] | 'all'>> | 'all' | undefined
    },
    pathsOf: (key, id) => {
      const paths = context.paths(key)
      if (paths === 'all') {
        return 'all'
      }

      return paths?.[id] as readonly MutationSchemaPath<TSchema[typeof key]>[] | 'all' | undefined
    },
    changed: (key, id) => {
      if (raw.reset === true) {
        return true
      }

      if (id === undefined) {
        return hasChange(raw.changes, key)
      }

      const ids = context.ids(key)
      if (ids === 'all') {
        return true
      }
      if ((ids as readonly string[] | undefined)?.includes(id as string)) {
        return true
      }

      const paths = context.pathsOf(key, id)
      if (paths === 'all') {
        return true
      }

      return Array.isArray(paths)
        && paths.length > 0
    },
    matches: (key, id, predicate) => {
      if (raw.reset === true) {
        return true
      }

      const ids = context.ids(key)
      const paths = context.pathsOf(key, id)

      if (paths === 'all') {
        return true
      }
      if (Array.isArray(paths) && paths.some(predicate)) {
        return true
      }

      if (ids === 'all') {
        return true
      }

      return Boolean(
        (ids as readonly string[] | undefined)?.includes(id as string)
        && paths === undefined
      )
    },
    touchedIds: (keys) => (
      collectMutationTouchedIds(raw, keys) as ReadonlySet<any> | 'all'
    )
  }

  return Object.freeze({
    ...raw,
    raw,
    ...input.build(context)
  })
}

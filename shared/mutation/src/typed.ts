import type {
  MutationChange,
  MutationChangeInput,
  MutationDelta,
  MutationDeltaInput
} from './write'
import {
  createMutationChangeMap,
  EMPTY_MUTATION_CHANGE_MAP
} from './write'

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

export type MutationSchemaId<TEntry> = TEntry extends MutationSchemaEntry<infer TId, any>
  ? TId
  : string

export type MutationSchemaPath<TEntry> = TEntry extends MutationSchemaEntry<any, infer TPath>
  ? TPath
  : string

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
  || delta.changes.has(key)

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
    const ids = readMutationChangeIds<TId>(delta.changes.get(keys[index]!))
    if (ids === 'all') {
      return 'all'
    }
    ids?.forEach((id) => {
      result.add(id)
    })
  }

  return result
}

const isMutationChangeMap = (
  value: unknown
): value is MutationDelta['changes'] => typeof value === 'object'
  && value !== null
  && 'has' in value
  && typeof (value as { has?: unknown }).has === 'function'
  && 'get' in value
  && typeof (value as { get?: unknown }).get === 'function'

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
      changes: EMPTY_MUTATION_CHANGE_MAP
    }
  }

  if (isMutationChangeMap(input.changes)) {
    return input as MutationDelta
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
      ? createMutationChangeMap(normalized)
      : EMPTY_MUTATION_CHANGE_MAP
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
      || raw.changes.get(key)?.order === true,
    ids: (key) => {
      if (!idsCache.has(key)) {
        idsCache.set(
          key,
          readMutationChangeIds(raw.changes.get(key))
        )
      }
      return idsCache.get(key) as readonly MutationSchemaId<TSchema[typeof key]>[] | 'all' | undefined
    },
    paths: (key) => {
      if (!pathsCache.has(key)) {
        const rawPaths = readMutationChangePaths(raw.changes.get(key))
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
        return raw.changes.has(key)
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

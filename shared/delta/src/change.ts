import {
  spec as specApi
} from '@shared/spec'
import {
  idDelta,
  type IdDelta
} from './idDelta'

type ChangeLeaf = 'flag' | 'ids' | 'set'
type ChangeSpecValue = ChangeLeaf | ChangeSpecTree
type ChangeSpecTree = {
  [key: string]: ChangeSpecValue
}

type ChangeTypeConfig = {
  ids?: Partial<Record<string, unknown>>
  set?: Partial<Record<string, unknown>>
}

type JoinChangePath<
  TPrefix extends string,
  TKey extends string
> = TPrefix extends ''
  ? TKey
  : `${TPrefix}.${TKey}`

type ChangeLeafPaths<
  TSpec extends ChangeSpecTree,
  TKind extends ChangeLeaf,
  TPrefix extends string = ''
> = {
  [TKey in keyof TSpec & string]:
    TSpec[TKey] extends TKind
      ? JoinChangePath<TPrefix, TKey>
      : TSpec[TKey] extends ChangeSpecTree
        ? ChangeLeafPaths<TSpec[TKey], TKind, JoinChangePath<TPrefix, TKey>>
        : never
}[keyof TSpec & string]

type ChangePathId<
  TConfig extends ChangeTypeConfig,
  TKey extends string
> = TConfig['ids'] extends Record<string, unknown>
  ? TKey extends keyof TConfig['ids']
    ? TConfig['ids'][TKey]
    : unknown
  : unknown

type ChangePathSetValue<
  TConfig extends ChangeTypeConfig,
  TKey extends string
> = TConfig['set'] extends Record<string, unknown>
  ? TKey extends keyof TConfig['set']
    ? TConfig['set'][TKey]
    : unknown
  : unknown

type ChangeIdsState<TId = unknown> = IdDelta<TId>

type ChangeStateOf<
  TSpec extends ChangeSpecTree,
  TConfig extends ChangeTypeConfig = {},
  TPrefix extends string = ''
> = {
  -readonly [TKey in keyof TSpec]:
    TSpec[TKey] extends 'flag'
      ? boolean
      : TSpec[TKey] extends 'ids'
        ? ChangeIdsState<
            ChangePathId<TConfig, JoinChangePath<TPrefix, TKey & string>>
          >
        : TSpec[TKey] extends 'set'
          ? Set<
              ChangePathSetValue<TConfig, JoinChangePath<TPrefix, TKey & string>>
            >
          : TSpec[TKey] extends ChangeSpecTree
            ? ChangeStateOf<
                TSpec[TKey],
                TConfig,
                JoinChangePath<TPrefix, TKey & string>
              >
            : never
}

type ChangeLeafState = boolean | ChangeIdsState | Set<unknown>
type ChangeStateRecord = Record<string, unknown>
type ChangeAllLeafPaths<TSpec extends ChangeSpecTree> =
  | ChangeLeafPaths<TSpec, 'flag'>
  | ChangeLeafPaths<TSpec, 'ids'>
  | ChangeLeafPaths<TSpec, 'set'>

type ChangeLeafEntry = {
  key: string
  parts: readonly string[]
  kind: ChangeLeaf
}

const buildLeafEntries = (
  schema: ChangeSpecTree
): readonly ChangeLeafEntry[] => {
  return specApi.tree(schema).leafEntries.map((entry) => {
    if (entry.kind !== 'flag' && entry.kind !== 'ids' && entry.kind !== 'set') {
      throw new Error(`Unsupported change leaf kind: ${entry.kind}`)
    }

    return {
      key: entry.key,
      parts: entry.parts,
      kind: entry.kind
    }
  })
}

const createLeafState = (
  kind: ChangeLeaf
): ChangeLeafState => {
  switch (kind) {
    case 'flag':
      return false
    case 'ids':
      return idDelta.create()
    case 'set':
      return new Set()
  }
}

const readIdsState = (
  value: ChangeLeafState
): ChangeIdsState<unknown> => value as ChangeIdsState<unknown>

const readSetState = (
  value: ChangeLeafState
): Set<unknown> => value as Set<unknown>

const cloneLeafState = (
  kind: ChangeLeaf,
  value: ChangeLeafState
): ChangeLeafState => {
  switch (kind) {
    case 'flag':
      return value
    case 'ids':
      return idDelta.clone(readIdsState(value))
    case 'set':
      return new Set(readSetState(value))
  }
}

const resetLeafState = (
  kind: ChangeLeaf,
  value: ChangeLeafState
): ChangeLeafState => {
  switch (kind) {
    case 'flag':
      return false
    case 'ids':
      idDelta.reset(readIdsState(value))
      return value
    case 'set':
      readSetState(value).clear()
      return value
  }
}

const hasLeafState = (
  kind: ChangeLeaf,
  value: ChangeLeafState
): boolean => {
  switch (kind) {
    case 'flag':
      return value === true
    case 'ids':
      return idDelta.hasAny(readIdsState(value))
    case 'set':
      return readSetState(value).size > 0
  }
}

const ensureParent = (
  target: ChangeStateRecord,
  parts: readonly string[]
): ChangeStateRecord => {
  let current = target

  for (const part of parts.slice(0, -1)) {
    const next = current[part]
    if (typeof next === 'object' && next !== null) {
      current = next as ChangeStateRecord
      continue
    }

    const created: ChangeStateRecord = {}
    current[part] = created
    current = created
  }

  return current
}

const readLeaf = (
  target: ChangeStateRecord,
  parts: readonly string[]
): ChangeLeafState => {
  let current: unknown = target

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Invalid change state path: ${parts.join('.')}`)
    }

    current = (current as ChangeStateRecord)[part]
  }

  return current as ChangeLeafState
}

const writeLeaf = (
  target: ChangeStateRecord,
  parts: readonly string[],
  value: ChangeLeafState
): void => {
  const parent = ensureParent(target, parts)
  const last = parts[parts.length - 1]
  if (last === undefined) {
    throw new Error('Cannot write change state at empty path.')
  }

  parent[last] = value
}

const buildState = (
  entries: readonly ChangeLeafEntry[]
): ChangeStateRecord => {
  const state: ChangeStateRecord = {}

  for (const entry of entries) {
    writeLeaf(state, entry.parts, createLeafState(entry.kind))
  }

  return state
}

const cloneState = (
  state: ChangeStateRecord,
  entries: readonly ChangeLeafEntry[]
): ChangeStateRecord => {
  const next: ChangeStateRecord = {}

  for (const entry of entries) {
    writeLeaf(
      next,
      entry.parts,
      cloneLeafState(entry.kind, readLeaf(state, entry.parts))
    )
  }

  return next
}

const resetState = (
  state: ChangeStateRecord,
  entries: readonly ChangeLeafEntry[]
): void => {
  for (const entry of entries) {
    writeLeaf(
      state,
      entry.parts,
      resetLeafState(entry.kind, readLeaf(state, entry.parts))
    )
  }
}

const createLeafIndex = (
  entries: readonly ChangeLeafEntry[]
): ReadonlyMap<string, ChangeLeafEntry> => new Map(
  entries.map((entry) => [entry.key, entry] as const)
)

const readEntry = (
  index: ReadonlyMap<string, ChangeLeafEntry>,
  key: string,
  expected?: ChangeLeaf
): ChangeLeafEntry => {
  const entry = index.get(key)
  if (!entry) {
    throw new Error(`Unknown change key: ${key}`)
  }

  if (expected && entry.kind !== expected) {
    throw new Error(
      `Change key ${key} expects ${expected}, received ${entry.kind}.`
    )
  }

  return entry
}

export const change = <
  const TSpec extends ChangeSpecTree,
  TConfig extends ChangeTypeConfig = {}
>(
  spec: TSpec
) => {
  const entries = buildLeafEntries(spec)
  const entryByKey = createLeafIndex(entries)

  return {
    create: (): ChangeStateOf<TSpec, TConfig> => buildState(entries) as ChangeStateOf<TSpec, TConfig>,
    flag: <TKey extends ChangeLeafPaths<TSpec, 'flag'>>(
      state: ChangeStateOf<TSpec, TConfig>,
      key: TKey
    ): void => {
      const entry = readEntry(entryByKey, key, 'flag')
      writeLeaf(state as ChangeStateRecord, entry.parts, true)
    },
    ids: {
      add: <TKey extends ChangeLeafPaths<TSpec, 'ids'>>(
        state: ChangeStateOf<TSpec, TConfig>,
        key: TKey,
        id: ChangePathId<TConfig, TKey>
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.add(
          readIdsState(readLeaf(state as ChangeStateRecord, entry.parts)),
          id
        )
      },
      update: <TKey extends ChangeLeafPaths<TSpec, 'ids'>>(
        state: ChangeStateOf<TSpec, TConfig>,
        key: TKey,
        id: ChangePathId<TConfig, TKey>
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.update(
          readIdsState(readLeaf(state as ChangeStateRecord, entry.parts)),
          id
        )
      },
      remove: <TKey extends ChangeLeafPaths<TSpec, 'ids'>>(
        state: ChangeStateOf<TSpec, TConfig>,
        key: TKey,
        id: ChangePathId<TConfig, TKey>
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.remove(
          readIdsState(readLeaf(state as ChangeStateRecord, entry.parts)),
          id
        )
      },
      clear: <TKey extends ChangeLeafPaths<TSpec, 'ids'>>(
        state: ChangeStateOf<TSpec, TConfig>,
        key: TKey
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.reset(
          readIdsState(readLeaf(state as ChangeStateRecord, entry.parts))
        )
      }
    },
    set: <TKey extends ChangeLeafPaths<TSpec, 'set'>>(
      state: ChangeStateOf<TSpec, TConfig>,
      key: TKey,
      value: ChangePathSetValue<TConfig, TKey>
    ): void => {
      const entry = readEntry(entryByKey, key, 'set')
      const target = readSetState(
        readLeaf(state as ChangeStateRecord, entry.parts)
      )
      target.add(value)
    },
    has: (
      state: ChangeStateOf<TSpec, TConfig>
    ): boolean => entries.some((entry) => (
      hasLeafState(entry.kind, readLeaf(state as ChangeStateRecord, entry.parts))
    )),
    take: (
      state: ChangeStateOf<TSpec, TConfig>
    ): ChangeStateOf<TSpec, TConfig> => {
      const current = cloneState(state as ChangeStateRecord, entries)
      resetState(state as ChangeStateRecord, entries)
      return current as ChangeStateOf<TSpec, TConfig>
    },
    path: <TKey extends ChangeAllLeafPaths<TSpec>>(
      key: TKey
    ): readonly string[] => readEntry(entryByKey, key).parts
  }
}

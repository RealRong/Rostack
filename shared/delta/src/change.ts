import {
  joinDotKey,
  splitDotKey,
  walkSpec,
  type SpecTree
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

type ChangeIdsState<TId = unknown> = IdDelta<TId>

type ChangeStateOf<TSpec extends ChangeSpecTree> = {
  [TKey in keyof TSpec]:
    TSpec[TKey] extends 'flag'
      ? boolean
      : TSpec[TKey] extends 'ids'
        ? ChangeIdsState<unknown>
        : TSpec[TKey] extends 'set'
          ? Set<unknown>
          : TSpec[TKey] extends ChangeSpecTree
            ? ChangeStateOf<TSpec[TKey]>
            : never
}

type ChangeLeafState = boolean | ChangeIdsState<unknown> | Set<unknown>

type ChangeLeafEntry = {
  key: string
  parts: readonly string[]
  kind: ChangeLeaf
}

const buildLeafEntries = (
  spec: ChangeSpecTree
): readonly ChangeLeafEntry[] => {
  const entries: ChangeLeafEntry[] = []

  walkSpec(spec as SpecTree, {
    leaf: (parts, kind) => {
      if (kind !== 'flag' && kind !== 'ids' && kind !== 'set') {
        throw new Error(`Unsupported change leaf kind: ${kind}`)
      }

      entries.push({
        key: joinDotKey(parts),
        parts,
        kind
      })
    }
  })

  return entries
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
  target: Record<string, unknown>,
  parts: readonly string[]
): Record<string, unknown> => {
  let current = target

  for (const part of parts.slice(0, -1)) {
    const next = current[part]
    if (typeof next === 'object' && next !== null) {
      current = next as Record<string, unknown>
      continue
    }

    const created: Record<string, unknown> = {}
    current[part] = created
    current = created
  }

  return current
}

const readLeaf = (
  target: Record<string, unknown>,
  parts: readonly string[]
): ChangeLeafState => {
  let current: unknown = target

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Invalid change state path: ${joinDotKey(parts)}`)
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current as ChangeLeafState
}

const writeLeaf = (
  target: Record<string, unknown>,
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
): Record<string, unknown> => {
  const state: Record<string, unknown> = {}

  for (const entry of entries) {
    writeLeaf(state, entry.parts, createLeafState(entry.kind))
  }

  return state
}

const cloneState = (
  state: Record<string, unknown>,
  entries: readonly ChangeLeafEntry[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = {}

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
  state: Record<string, unknown>,
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

export const change = <const TSpec extends ChangeSpecTree>(
  spec: TSpec
) => {
  const entries = buildLeafEntries(spec)
  const entryByKey = createLeafIndex(entries)

  return {
    create: (): ChangeStateOf<TSpec> => buildState(entries) as ChangeStateOf<TSpec>,
    flag: (
      state: ChangeStateOf<TSpec>,
      key: string
    ): void => {
      const entry = readEntry(entryByKey, key, 'flag')
      writeLeaf(state as Record<string, unknown>, entry.parts, true)
    },
    ids: {
      add: (
        state: ChangeStateOf<TSpec>,
        key: string,
        id: unknown
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.add(
          readIdsState(readLeaf(state as Record<string, unknown>, entry.parts)),
          id
        )
      },
      update: (
        state: ChangeStateOf<TSpec>,
        key: string,
        id: unknown
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.update(
          readIdsState(readLeaf(state as Record<string, unknown>, entry.parts)),
          id
        )
      },
      remove: (
        state: ChangeStateOf<TSpec>,
        key: string,
        id: unknown
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.remove(
          readIdsState(readLeaf(state as Record<string, unknown>, entry.parts)),
          id
        )
      },
      clear: (
        state: ChangeStateOf<TSpec>,
        key: string
      ): void => {
        const entry = readEntry(entryByKey, key, 'ids')
        idDelta.reset(
          readIdsState(readLeaf(state as Record<string, unknown>, entry.parts))
        )
      }
    },
    set: (
      state: ChangeStateOf<TSpec>,
      key: string,
      value: unknown
    ): void => {
      const entry = readEntry(entryByKey, key, 'set')
      const target = readSetState(
        readLeaf(state as Record<string, unknown>, entry.parts)
      )
      target.add(value)
    },
    has: (
      state: ChangeStateOf<TSpec>
    ): boolean => entries.some((entry) => (
      hasLeafState(entry.kind, readLeaf(state as Record<string, unknown>, entry.parts))
    )),
    take: (
      state: ChangeStateOf<TSpec>
    ): ChangeStateOf<TSpec> => {
      const current = cloneState(state as Record<string, unknown>, entries)
      resetState(state as Record<string, unknown>, entries)
      return current as ChangeStateOf<TSpec>
    },
    path: (
      key: string
    ): readonly string[] => splitDotKey(readEntry(entryByKey, key).key)
  }
}

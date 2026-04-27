import {
  joinDotKey,
  walkSpec,
  type SpecTree
} from '@shared/spec'

export type ScopeFieldSpec = 'flag' | 'set' | 'value'

type ScopeValueShape = object
interface ScopeSchemaObject {
  [key: string]: ScopeSchemaValue
}

type ScopeSchemaValue =
  | ScopeFieldSpec
  | ScopeSchemaObject

export type ScopeSchema<TValueShape extends ScopeValueShape> = {
  [K in keyof TValueShape]:
    TValueShape[K] extends boolean
      ? 'flag'
      : TValueShape[K] extends ReadonlySet<any>
        ? 'set'
        : 'value'
}

export type ScopeValue<TValueShape> = TValueShape extends object
  ? TValueShape
  : undefined

export type ScopeInputValue<TValueShape> = TValueShape extends object
  ? Partial<{
      [K in keyof TValueShape]:
        TValueShape[K] extends boolean
          ? boolean
          : TValueShape[K] extends ReadonlySet<infer TValue>
            ? Iterable<TValue> | ReadonlySet<TValue>
            : TValueShape[K]
    }>
  : undefined

export type PhaseScopeMap<TPhaseName extends string> = {
  [K in TPhaseName]: object | undefined
}

export type DefaultPhaseScopeMap<TPhaseName extends string> = {
  [K in TPhaseName]: undefined
}

export type PhaseScopeInput<
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>
> = Partial<{
  [K in TPhaseName]: ScopeInputValue<TScopeMap[K]>
}>

const EMPTY_SET = new Set<never>() as ReadonlySet<never>

type ScopeLeafEntry = {
  key: string
  parts: readonly string[]
  kind: ScopeFieldSpec
}

const readFlagValue = (
  current: boolean | undefined,
  next: boolean | undefined
): boolean => (current ?? false) || next === true

const toReadonlySet = <TValue>(
  values?: Iterable<TValue> | ReadonlySet<TValue>
): ReadonlySet<TValue> => {
  if (!values) {
    return EMPTY_SET as ReadonlySet<TValue>
  }

  if (values instanceof Set) {
    return values.size > 0
      ? values
      : EMPTY_SET as ReadonlySet<TValue>
  }

  const next = new Set(values)
  return next.size > 0
    ? next
    : EMPTY_SET as ReadonlySet<TValue>
}

const unionReadonlySet = <TValue>(
  current: ReadonlySet<TValue> | undefined,
  next: Iterable<TValue> | ReadonlySet<TValue> | undefined
): ReadonlySet<TValue> => {
  const currentSet = current ?? EMPTY_SET as ReadonlySet<TValue>
  if (!next) {
    return currentSet
  }

  const nextSet = toReadonlySet(next)
  if (nextSet.size === 0) {
    return currentSet
  }
  if (currentSet.size === 0) {
    return nextSet
  }

  let merged: Set<TValue> | undefined
  nextSet.forEach((value) => {
    if (currentSet.has(value)) {
      return
    }

    if (!merged) {
      merged = new Set(currentSet)
    }
    merged.add(value)
  })

  return merged ?? currentSet
}

const buildLeafEntries = (
  schema: ScopeSchemaObject
): readonly ScopeLeafEntry[] => {
  const entries: ScopeLeafEntry[] = []

  walkSpec(schema as SpecTree, {
    leaf: (parts, kind) => {
      if (kind !== 'flag' && kind !== 'set' && kind !== 'value') {
        throw new Error(`Unsupported scope leaf kind: ${kind}`)
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
  target: Record<string, unknown> | undefined,
  parts: readonly string[]
): unknown => {
  let current: unknown = target

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current
}

const writeLeaf = (
  target: Record<string, unknown>,
  parts: readonly string[],
  value: unknown
): void => {
  const parent = ensureParent(target, parts)
  const last = parts[parts.length - 1]
  if (last === undefined) {
    throw new Error('Cannot write scope state at empty path.')
  }

  parent[last] = value
}

const normalizeLeafValue = (
  kind: ScopeFieldSpec,
  value: unknown
): unknown => {
  switch (kind) {
    case 'flag':
      return value === true
    case 'set':
      return toReadonlySet(
        value as Iterable<unknown> | ReadonlySet<unknown> | undefined
      )
    case 'value':
      return value
  }
}

const mergeLeafValue = (
  kind: ScopeFieldSpec,
  current: unknown,
  next: unknown
): unknown => {
  switch (kind) {
    case 'flag':
      return readFlagValue(
        current as boolean | undefined,
        next as boolean | undefined
      )
    case 'set':
      return unionReadonlySet(
        current as ReadonlySet<unknown> | undefined,
        next as Iterable<unknown> | ReadonlySet<unknown> | undefined
      )
    case 'value':
      return next !== undefined
        ? next
        : current
  }
}

const isEmptyLeafValue = (
  kind: ScopeFieldSpec,
  value: unknown
): boolean => {
  switch (kind) {
    case 'flag':
      return value !== true
    case 'set':
      return (value as ReadonlySet<unknown>).size === 0
    case 'value':
      return value === undefined
  }
}

export const normalizeScopeValue = <TValueShape extends ScopeValueShape>(
  schema: ScopeSchema<TValueShape>,
  input?: ScopeInputValue<TValueShape>
): ScopeValue<TValueShape> => {
  const next: Record<string, unknown> = {}

  for (const entry of buildLeafEntries(schema as ScopeSchemaObject)) {
    writeLeaf(
      next,
      entry.parts,
      normalizeLeafValue(
        entry.kind,
        readLeaf(input as Record<string, unknown> | undefined, entry.parts)
      )
    )
  }

  return next as ScopeValue<TValueShape>
}

export const mergeScopeValue = <TValueShape extends ScopeValueShape>(
  schema: ScopeSchema<TValueShape>,
  current: ScopeValue<TValueShape> | undefined,
  next: ScopeInputValue<TValueShape>
): ScopeValue<TValueShape> => {
  const merged: Record<string, unknown> = {}

  for (const entry of buildLeafEntries(schema as ScopeSchemaObject)) {
    writeLeaf(
      merged,
      entry.parts,
      mergeLeafValue(
        entry.kind,
        readLeaf(current as Record<string, unknown> | undefined, entry.parts),
        readLeaf(next as Record<string, unknown> | undefined, entry.parts)
      )
    )
  }

  return merged as ScopeValue<TValueShape>
}

export const isScopeValueEmpty = <TValueShape extends ScopeValueShape>(
  schema: ScopeSchema<TValueShape>,
  value: ScopeValue<TValueShape>
): boolean => buildLeafEntries(schema as ScopeSchemaObject).every((entry) => (
  isEmptyLeafValue(
    entry.kind,
    readLeaf(value as Record<string, unknown>, entry.parts)
  )
))

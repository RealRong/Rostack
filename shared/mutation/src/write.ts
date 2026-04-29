export type MutationOrigin =
  | 'user'
  | 'remote'
  | 'system'
  | 'history'

export type Origin = MutationOrigin

export type MutationChangeInput =
  | true
  | readonly string[]
  | {
      ids?: readonly string[] | 'all'
      paths?: Record<string, readonly string[] | 'all'> | 'all'
      order?: true
      [payload: string]: unknown
    }

export interface MutationChange {
  ids?: readonly string[] | 'all'
  paths?: Readonly<Record<string, readonly string[] | 'all'>> | 'all'
  order?: true
  [payload: string]: unknown
}

export interface MutationChangeMap {
  readonly size: number
  has(key: string): boolean
  get(key: string): MutationChange | undefined
  keys(): IterableIterator<string>
  values(): IterableIterator<MutationChange>
  entries(): IterableIterator<[string, MutationChange]>
}

type MutationChangeRecord = Readonly<Record<string, MutationChange>>

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const EMPTY_MUTATION_CHANGE_RECORD = Object.freeze(
  Object.create(null)
) as MutationChangeRecord

export const createMutationChangeMap = (
  record?: Record<string, MutationChange>
): MutationChangeMap => {
  const keys = Object.keys(record ?? {})
  const normalized: Record<string, MutationChange> = {}
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!
    normalized[key] = record![key]!
  }

  const map = normalized as Record<string, MutationChange> & MutationChangeMap

  Object.defineProperties(map, {
    size: {
      get: () => keys.length,
      enumerable: false
    },
    has: {
      value: (key: string) => hasOwn(normalized, key),
      enumerable: false
    },
    get: {
      value: (key: string) => normalized[key],
      enumerable: false
    },
    keys: {
      value: function *keysIterator(): IterableIterator<string> {
        yield* Object.keys(normalized)
      },
      enumerable: false
    },
    values: {
      value: function *valuesIterator(): IterableIterator<MutationChange> {
        for (const key of Object.keys(normalized)) {
          yield normalized[key]!
        }
      },
      enumerable: false
    },
    entries: {
      value: function *entriesIterator(): IterableIterator<[string, MutationChange]> {
        for (const key of Object.keys(normalized)) {
          yield [key, normalized[key]!]
        }
      },
      enumerable: false
    }
  })

  return Object.freeze(map)
}

export const EMPTY_MUTATION_CHANGE_MAP: MutationChangeMap = createMutationChangeMap(
  EMPTY_MUTATION_CHANGE_RECORD
)

export interface MutationDelta {
  reset?: true
  changes: MutationChangeMap
}

export interface MutationDeltaInput {
  reset?: true
  changes?: Record<string, MutationChangeInput>
}

export type MutationFootprint =
  | {
      kind: 'global'
      family: string
    }
  | {
      kind: 'entity'
      family: string
      id: string
    }
  | {
      kind: 'field'
      family: string
      id: string
      field: string
    }
  | {
      kind: 'record'
      family: string
      id: string
      scope: string
      path: string
    }
  | {
      kind: 'relation'
      family: string
      id: string
      relation: string
      target?: string
    }

export type MutationFootprintInput = MutationFootprint

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const readNonEmptyString = (
  value: unknown
): string | undefined => (
  typeof value === 'string'
  && value.length > 0
)
  ? value
  : undefined

export const isMutationFootprint = (
  value: unknown
): value is MutationFootprint => {
  if (
    !isObjectRecord(value)
    || typeof value.kind !== 'string'
    || typeof value.family !== 'string'
  ) {
    return false
  }

  switch (value.kind) {
    case 'global':
      return value.family.length > 0
    case 'entity':
      return readNonEmptyString(value.id) !== undefined
    case 'field':
      return (
        readNonEmptyString(value.id) !== undefined
        && readNonEmptyString(value.field) !== undefined
      )
    case 'record':
      return (
        readNonEmptyString(value.id) !== undefined
        && readNonEmptyString(value.scope) !== undefined
        && typeof value.path === 'string'
      )
    case 'relation':
      return (
        readNonEmptyString(value.id) !== undefined
        && readNonEmptyString(value.relation) !== undefined
        && (value.target === undefined || readNonEmptyString(value.target) !== undefined)
      )
    default:
      return false
  }
}

export const assertMutationFootprint = (
  value: unknown
): MutationFootprint => {
  if (!isMutationFootprint(value)) {
    throw new Error('Mutation footprint entry is invalid.')
  }

  return value
}

export const assertMutationFootprintList = (
  value: unknown
): readonly MutationFootprint[] => {
  if (!Array.isArray(value)) {
    throw new Error('Mutation footprint must be an array.')
  }

  value.forEach((entry) => {
    assertMutationFootprint(entry)
  })

  return value
}

export interface MutationIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
  path?: string
  details?: unknown
}

export interface MutationCommit<
  Doc,
  Op,
  Footprint = MutationFootprint
> {
  kind: 'apply'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  delta: MutationDelta
  footprint: readonly Footprint[]
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}

export interface MutationReplaceCommit<Doc> {
  kind: 'replace'
  rev: number
  at: number
  origin: MutationOrigin
  document: Doc
  delta: MutationDelta
  issues: readonly MutationIssue[]
  outputs: readonly unknown[]
}

export type MutationReplaceResult<Doc> = MutationReplaceCommit<Doc>

export type MutationCommitRecord<
  Doc,
  Op,
  Footprint = MutationFootprint
> =
  | MutationCommit<Doc, Op, Footprint>
  | MutationReplaceCommit<Doc>

export interface ApplyCommit<
  Doc,
  Op,
  Footprint = MutationFootprint,
  Extra = void
> extends MutationCommit<Doc, Op, Footprint> {
  extra: Extra
}

export type ReplaceCommit<Doc> = MutationReplaceCommit<Doc>

export type CommitRecord<
  Doc,
  Op,
  Footprint = MutationFootprint,
  Extra = void
> =
  | ApplyCommit<Doc, Op, Footprint, Extra>
  | ReplaceCommit<Doc>

export interface CommitStream<C> {
  subscribe(listener: (commit: C) => void): () => void
}

export type SpecLeaf = string

export type SpecTree = {
  [key: string]: SpecLeaf | SpecTree
}

type TableKey<TTable extends Record<string, unknown>> = Extract<keyof TTable, string>
type TableValue<TTable extends Record<string, unknown>> = TTable[TableKey<TTable>]
type TableEntry<TTable extends Record<string, unknown>> = readonly [
  TableKey<TTable>,
  TableValue<TTable>
]

export type TreeLeafEntry<TKind extends string = string> = {
  key: string
  parts: readonly string[]
  kind: TKind
  parentKey: string | undefined
}

export type KeyScalar =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined

export interface TableSpecIndex<
  TTable extends Record<string, unknown>,
  TFallback = never
> {
  keys: readonly TableKey<TTable>[]
  values: readonly TableValue<TTable>[]
  entries: readonly TableEntry<TTable>[]
  has(key: string): key is TableKey<TTable>
  get<TKey extends TableKey<TTable>>(key: TKey): TTable[TKey]
  resolve(key: string): TableValue<TTable> | TFallback
  project<TOutput>(
    select: (entry: TableEntry<TTable>) => TOutput
  ): Readonly<Record<string, TOutput>>
}

export interface TreeSpecIndex<TTree extends SpecTree> {
  root: TTree
  leafEntries: readonly TreeLeafEntry[]
  keySet: ReadonlySet<string>
  has(key: string): boolean
  get(key: string): TreeLeafEntry
  keyParts(key: string): readonly string[]
  parent(key: string): string | undefined
  children(key?: string): readonly string[]
  prefix(key?: string): readonly TreeLeafEntry[]
}

export interface TupleKeyCodec<TFields extends readonly string[]> {
  fields: TFields
  write(input: Partial<Record<TFields[number], KeyScalar>>): string
  read(input: string): Readonly<Record<TFields[number], string | undefined>>
}

export interface TaggedKeyCodec<TTags extends readonly string[]> {
  tags: TTags
  has(input: string): input is `${TTags[number]}:${string}`
  write<TKind extends TTags[number], TId extends string>(input: {
    kind: TKind
    id: TId
  }): `${TKind}:${TId}`
  read<TValue extends `${TTags[number]}:${string}`>(
    input: TValue
  ): TaggedKeyValue<TValue, TTags>
}

export interface PathKeyCodec {
  write(parts: readonly KeyScalar[]): string
  read(input: string): readonly string[]
  conflicts(left: string, right: string): boolean
}

type TaggedKeyValue<
  TValue extends string,
  TTags extends readonly string[]
> = TValue extends `${infer TKind}:${infer TId}`
  ? TKind extends TTags[number]
    ? {
        kind: TKind
        id: TId
      }
    : never
  : never

const readRecordKeys = <TRecord extends Record<string, unknown>>(
  record: TRecord
): readonly TableKey<TRecord>[] => Reflect.ownKeys(record).filter(
  (key): key is TableKey<TRecord> => typeof key === 'string'
)

const freezeEntries = <TValue>(
  value: readonly TValue[]
): readonly TValue[] => Object.freeze(value.slice())

const hasRecordKey = <TRecord extends Record<string, unknown>>(
  keySet: ReadonlySet<string>,
  currentKey: string
): currentKey is TableKey<TRecord> => keySet.has(currentKey)

const readTupleInputValue = <TFields extends readonly string[]>(
  input: Partial<Record<TFields[number], KeyScalar>>,
  field: TFields[number]
): KeyScalar => input[field]

const pathCodec: PathKeyCodec = {
  write: (parts) => parts.map((part) => String(part ?? ''))
    .map((part) => part.replaceAll('\\', '\\\\').replaceAll('.', '\\.'))
    .join('.'),
  read: (input) => {
    if (input === '') {
      return []
    }

    const parts: string[] = []
    let current = ''
    let escaping = false

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index]
      if (char === undefined) {
        continue
      }

      if (escaping) {
        current += char
        escaping = false
        continue
      }

      if (char === '\\') {
        escaping = true
        continue
      }

      if (char === '.') {
        parts.push(current)
        current = ''
        continue
      }

      current += char
    }

    if (escaping) {
      current += '\\'
    }

    parts.push(current)
    return freezeEntries(parts)
  },
  conflicts: (left, right) => {
    const leftParts = pathCodec.read(left)
    const rightParts = pathCodec.read(right)
    const size = Math.min(leftParts.length, rightParts.length)
    for (let index = 0; index < size; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        return false
      }
    }
    return true
  }
}

const writeTupleSegment = (
  value: KeyScalar
): string => {
  if (value === undefined) {
    return 'u0:'
  }

  const text = String(value)
  return `s${text.length}:${text}`
}

const readTupleSegment = (
  input: string,
  offset: number
): {
  nextOffset: number
  value: string | undefined
} => {
  const kind = input[offset]
  if (kind !== 's' && kind !== 'u') {
    throw new Error(`Invalid tuple key kind at ${offset}.`)
  }

  let cursor = offset + 1
  let lengthText = ''
  while (cursor < input.length && input[cursor] !== ':') {
    const char = input[cursor]
    if (char === undefined || char < '0' || char > '9') {
      throw new Error(`Invalid tuple key length at ${offset}.`)
    }
    lengthText += char
    cursor += 1
  }

  if (input[cursor] !== ':') {
    throw new Error(`Invalid tuple key separator at ${offset}.`)
  }

  const length = Number(lengthText)
  if (!Number.isInteger(length) || length < 0) {
    throw new Error(`Invalid tuple key length at ${offset}.`)
  }

  const valueStart = cursor + 1
  const valueEnd = valueStart + length
  const value = input.slice(valueStart, valueEnd)
  if (value.length !== length) {
    throw new Error(`Unexpected tuple key end at ${offset}.`)
  }

  return {
    nextOffset: valueEnd,
    value: kind === 'u'
      ? undefined
      : value
  }
}

const isSpecTree = (
  value: SpecLeaf | SpecTree
): value is SpecTree => typeof value === 'object' && value !== null

export const spec = {
  table: <
    TTable extends Record<string, unknown>,
    TFallback = never
  >(
    table: TTable,
    options?: {
      fallback?: (key: string) => TFallback
    }
  ): TableSpecIndex<TTable, TFallback> => {
    const keys = freezeEntries(readRecordKeys(table))
    const entries = freezeEntries(
      keys.map((currentKey) => [currentKey, table[currentKey]] as const)
    )
    const keySet = new Set<string>(keys)

    return {
      keys,
      values: freezeEntries(entries.map(([, value]) => value)),
      entries,
      has: (currentKey): currentKey is TableKey<TTable> => hasRecordKey<TTable>(keySet, currentKey),
      get: (currentKey) => table[currentKey],
      resolve: (currentKey) => {
        if (hasRecordKey<TTable>(keySet, currentKey)) {
          return table[currentKey]
        }

        if (!options?.fallback) {
          throw new Error(`Unknown table key: ${currentKey}`)
        }

        return options.fallback(currentKey)
      },
      project: (select) => Object.freeze(
        Object.fromEntries(
          entries.map((entry) => [entry[0], select(entry)])
        )
      )
    }
  },
  tree: <TTree extends SpecTree>(
    tree: TTree
  ): TreeSpecIndex<TTree> => {
    const leafEntries: TreeLeafEntry[] = []
    const childKeys = new Map<string, string[]>()
    const leafEntriesByPrefix = new Map<string, TreeLeafEntry[]>()

    const ensureChildren = (
      currentKey: string
    ): string[] => {
      const current = childKeys.get(currentKey)
      if (current) {
        return current
      }

      const next: string[] = []
      childKeys.set(currentKey, next)
      return next
    }

    const pushPrefixLeaf = (
      currentKey: string,
      entry: TreeLeafEntry
    ): void => {
      const current = leafEntriesByPrefix.get(currentKey)
      if (current) {
        current.push(entry)
        return
      }

      leafEntriesByPrefix.set(currentKey, [entry])
    }

    const visit = (
      currentNode: SpecTree,
      parts: readonly string[]
    ): void => {
      const currentKey = pathCodec.write(parts)
      ensureChildren(currentKey)

      for (const childKey of readRecordKeys(currentNode)) {
        const child = currentNode[childKey]
        const nextParts = [...parts, childKey]
        const nextKey = pathCodec.write(nextParts)
        ensureChildren(currentKey).push(nextKey)

        if (isSpecTree(child)) {
          visit(child, nextParts)
          continue
        }

        const entry: TreeLeafEntry = {
          key: nextKey,
          parts: freezeEntries(nextParts),
          kind: child,
          parentKey: parts.length === 0
            ? undefined
            : currentKey
        }
        leafEntries.push(entry)
        pushPrefixLeaf('', entry)
        for (let size = 1; size <= nextParts.length; size += 1) {
          pushPrefixLeaf(pathCodec.write(nextParts.slice(0, size)), entry)
        }
      }
    }

    ensureChildren('')
    visit(tree, [])

    const frozenLeafEntries = freezeEntries(leafEntries)
    const leafEntryByKey = new Map(
      frozenLeafEntries.map((entry) => [entry.key, entry] as const)
    )
    const frozenChildren = new Map<string, readonly string[]>(
      [...childKeys.entries()].map(([currentKey, values]) => [
        currentKey,
        freezeEntries(values)
      ])
    )
    const frozenPrefixes = new Map<string, readonly TreeLeafEntry[]>(
      [...leafEntriesByPrefix.entries()].map(([currentKey, values]) => [
        currentKey,
        freezeEntries(values)
      ])
    )

    return {
      root: tree,
      leafEntries: frozenLeafEntries,
      keySet: new Set(frozenLeafEntries.map((entry) => entry.key)),
      has: (currentKey) => leafEntryByKey.has(currentKey),
      get: (currentKey) => {
        const current = leafEntryByKey.get(currentKey)
        if (!current) {
          throw new Error(`Unknown tree leaf key: ${currentKey}`)
        }
        return current
      },
      keyParts: (currentKey) => pathCodec.read(currentKey),
      parent: (currentKey) => {
        const parts = pathCodec.read(currentKey)
        if (parts.length <= 1) {
          return undefined
        }
        return pathCodec.write(parts.slice(0, -1))
      },
      children: (currentKey = '') => frozenChildren.get(currentKey) ?? [],
      prefix: (currentKey = '') => frozenPrefixes.get(currentKey) ?? []
    }
  }
} as const

export const key = {
  tuple: <const TFields extends readonly string[]>(
    fields: TFields
  ): TupleKeyCodec<TFields> => ({
    fields,
    write: (input) => fields.map(
      (field) => writeTupleSegment(readTupleInputValue(input, field))
    ).join(''),
    read: (input) => {
      const next: Record<string, string | undefined> = {}
      let offset = 0

      for (const field of fields) {
        const entry = readTupleSegment(input, offset)
        next[field] = entry.value
        offset = entry.nextOffset
      }

      if (offset !== input.length) {
        throw new Error(`Unexpected tuple key tail at ${offset}.`)
      }

      return Object.freeze(next) as Readonly<Record<TFields[number], string | undefined>>
    }
  }),
  tagged: <const TTags extends readonly string[]>(
    tags: TTags
  ): TaggedKeyCodec<TTags> => {
    const tagSet = new Set(tags)

    return {
      tags,
      has: (input): input is `${TTags[number]}:${string}` => {
        const separator = input.indexOf(':')
        if (separator <= 0) {
          return false
        }

        return tagSet.has(input.slice(0, separator))
      },
      write: (input) => `${input.kind}:${input.id}` as `${typeof input.kind}:${typeof input.id}`,
      read: (input) => {
        const separator = input.indexOf(':')
        if (separator <= 0) {
          throw new Error(`Invalid tagged key: ${input}`)
        }

        const currentKind = input.slice(0, separator)
        if (!tagSet.has(currentKind)) {
          throw new Error(`Invalid tagged key kind: ${currentKind}`)
        }

        return {
          kind: currentKind as TTags[number],
          id: input.slice(separator + 1)
        } as TaggedKeyValue<typeof input, TTags>
      }
    }
  },
  path: (): PathKeyCodec => pathCodec
} as const

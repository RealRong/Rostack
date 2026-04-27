export type SpecLeaf = string

export type SpecTree = {
  [key: string]: SpecLeaf | SpecTree
}

export interface SpecVisitor {
  enter?(path: readonly string[], node: SpecTree): void
  leaf(path: readonly string[], kind: SpecLeaf): void
  leave?(path: readonly string[], node: SpecTree): void
}

const isSpecTree = (
  value: SpecLeaf | SpecTree
): value is SpecTree => typeof value === 'object' && value !== null

const walkNode = (
  spec: SpecTree,
  visitor: SpecVisitor,
  path: readonly string[]
): void => {
  visitor.enter?.(path, spec)

  for (const [key, child] of Object.entries(spec)) {
    const nextPath = [...path, key]
    if (isSpecTree(child)) {
      walkNode(child, visitor, nextPath)
      continue
    }

    visitor.leaf(nextPath, child)
  }

  visitor.leave?.(path, spec)
}

export const walkSpec = (
  spec: SpecTree,
  visitor: SpecVisitor
): void => {
  walkNode(spec, visitor, [])
}

export const createTableIndex = <
  TTable extends Record<string, unknown>,
  TFallback = never
>(
  table: TTable,
  options?: {
    fallback?: (key: string) => TFallback
  }
) => {
  const entries = Object.entries(table) as Array<
    readonly [
      keyof TTable & string,
      TTable[keyof TTable & string]
    ]
  >
  const keySet = new Set<string>(entries.map(([key]) => key))

  return {
    keys: entries.map(([key]) => key),
    values: entries.map(([, value]) => value),
    entries,
    has: (key: string): key is keyof TTable & string => keySet.has(key),
    get: <TKey extends keyof TTable & string>(
      key: TKey
    ): TTable[TKey] => table[key],
    resolve: (
      key: string
    ): TTable[keyof TTable & string] | TFallback => {
      if (keySet.has(key)) {
        return table[key as keyof TTable & string]
      }

      if (!options?.fallback) {
        throw new Error(`Unknown table key: ${key}`)
      }

      return options.fallback(key)
    }
  } as const
}

export const createOneToOneIndex = <
  TTable extends Record<string, unknown>,
  TRef extends string
>(
  table: TTable,
  select: (entry: {
    key: keyof TTable & string
    value: TTable[keyof TTable & string]
  }) => TRef | null | undefined
): Readonly<Record<TRef, keyof TTable & string>> => {
  const next: Partial<Record<TRef, keyof TTable & string>> = {}

  for (const [key, value] of Object.entries(table) as Array<
    readonly [
      keyof TTable & string,
      TTable[keyof TTable & string]
    ]
  >) {
    const ref = select({
      key,
      value
    })

    if (ref === null || ref === undefined) {
      continue
    }

    next[ref] = key
  }

  return next as Readonly<Record<TRef, keyof TTable & string>>
}

export const createOneToManyIndex = <
  TTable extends Record<string, unknown>,
  TRef extends string
>(
  table: TTable,
  select: (entry: {
    key: keyof TTable & string
    value: TTable[keyof TTable & string]
  }) => TRef | readonly TRef[] | null | undefined
): Readonly<Record<TRef, readonly (keyof TTable & string)[]>> => {
  const next: Partial<Record<TRef, Array<keyof TTable & string>>> = {}

  for (const [key, value] of Object.entries(table) as Array<
    readonly [
      keyof TTable & string,
      TTable[keyof TTable & string]
    ]
  >) {
    const refs = select({
      key,
      value
    })

    if (refs === null || refs === undefined) {
      continue
    }

    const values = Array.isArray(refs)
      ? refs
      : [refs]

    for (const ref of values) {
      const current = next[ref as TRef]
      const bucket = current ?? []
      if (!current) {
        next[ref as TRef] = bucket
      }
      bucket.push(key)
    }
  }

  return Object.fromEntries(
    (Object.entries(next) as Array<readonly [string, Array<keyof TTable & string>]>).map(
      ([key, value]) => [key, Object.freeze(value.slice())]
    )
  ) as Readonly<Record<TRef, readonly (keyof TTable & string)[]>>
}

export const splitDotKey = (
  key: string
): readonly string[] => key === ''
  ? []
  : key.split('.')

export const joinDotKey = (
  parts: readonly string[]
): string => parts.join('.')

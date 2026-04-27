export type ScopeFieldSpec = 'flag' | 'set' | 'slot'

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
        : 'slot'
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

const isLeafField = (
  field: ScopeSchemaValue
): field is ScopeFieldSpec => (
  field === 'flag'
  || field === 'set'
  || field === 'slot'
)

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

const mergeFieldValue = (
  field: ScopeSchemaValue,
  current: unknown,
  next: unknown
): unknown => {
  if (!isLeafField(field)) {
    const value: Record<string, unknown> = {}
    Object.entries(field).forEach(([key, child]) => {
      value[key] = mergeFieldValue(
        child,
        (current as Record<string, unknown> | undefined)?.[key],
        (next as Record<string, unknown> | undefined)?.[key]
      )
    })
    return value
  }

  switch (field) {
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
    case 'slot':
      return next !== undefined
        ? next
        : current
  }
}

const normalizeFieldValue = (
  field: ScopeSchemaValue,
  value: unknown
): unknown => {
  if (!isLeafField(field)) {
    const next: Record<string, unknown> = {}
    Object.entries(field).forEach(([key, child]) => {
      next[key] = normalizeFieldValue(
        child,
        (value as Record<string, unknown> | undefined)?.[key]
      )
    })
    return next
  }

  switch (field) {
    case 'flag':
      return value === true
    case 'set':
      return toReadonlySet(
        value as Iterable<unknown> | ReadonlySet<unknown> | undefined
      )
    case 'slot':
      return value
  }
}

const isEmptyFieldValue = (
  field: ScopeSchemaValue,
  value: unknown
): boolean => {
  if (!isLeafField(field)) {
    return Object.entries(field).every(([key, child]) => (
      isEmptyFieldValue(
        child,
        (value as Record<string, unknown> | undefined)?.[key]
      )
    ))
  }

  switch (field) {
    case 'flag':
      return value !== true
    case 'set':
      return (value as ReadonlySet<unknown>).size === 0
    case 'slot':
      return value === undefined
  }
}

export const normalizeScopeValue = <TValueShape extends ScopeValueShape>(
  schema: ScopeSchema<TValueShape>,
  input?: ScopeInputValue<TValueShape>
): ScopeValue<TValueShape> => normalizeFieldValue(
  schema as ScopeSchemaValue,
  input
) as ScopeValue<TValueShape>

export const mergeScopeValue = <TValueShape extends ScopeValueShape>(
  schema: ScopeSchema<TValueShape>,
  current: ScopeValue<TValueShape> | undefined,
  next: ScopeInputValue<TValueShape>
): ScopeValue<TValueShape> => mergeFieldValue(
  schema as ScopeSchemaValue,
  current,
  next
) as ScopeValue<TValueShape>

export const isScopeValueEmpty = <TValueShape extends ScopeValueShape>(
  schema: ScopeSchema<TValueShape>,
  value: ScopeValue<TValueShape>
): boolean => isEmptyFieldValue(
  schema as ScopeSchemaValue,
  value
)

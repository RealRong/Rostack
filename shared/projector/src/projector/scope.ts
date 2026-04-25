import type {
  FlagScopeField,
  ScopeField,
  ScopeInputValue,
  ScopeSchema,
  ScopeValue,
  SetScopeField,
  SlotScopeField
} from '../contracts/scope'

const EMPTY_SET = new Set<never>() as ReadonlySet<never>

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
  field: ScopeField,
  current: unknown,
  next: unknown
): unknown => {
  switch (field.kind) {
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
  field: ScopeField,
  value: unknown
): unknown => {
  switch (field.kind) {
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
  field: ScopeField,
  value: unknown
): boolean => {
  switch (field.kind) {
    case 'flag':
      return value !== true
    case 'set':
      return (value as ReadonlySet<unknown>).size === 0
    case 'slot':
      return value === undefined
  }
}

export const normalizeScopeValue = <TSchema extends ScopeSchema>(
  schema: TSchema,
  input?: ScopeInputValue<TSchema>
): ScopeValue<TSchema> => {
  const value: Record<string, unknown> = {}

  for (const fieldName in schema.fields) {
    const field = schema.fields[fieldName]!
    value[fieldName] = normalizeFieldValue(
      field,
      input?.[fieldName as keyof ScopeInputValue<TSchema>]
    )
  }

  return value as ScopeValue<TSchema>
}

export const mergeScopeValue = <TSchema extends ScopeSchema>(
  schema: TSchema,
  current: ScopeValue<TSchema> | undefined,
  next: ScopeInputValue<TSchema>
): ScopeValue<TSchema> => {
  const value: Record<string, unknown> = {}

  for (const fieldName in schema.fields) {
    const field = schema.fields[fieldName]!
    value[fieldName] = mergeFieldValue(
      field,
      current?.[fieldName as keyof ScopeValue<TSchema>],
      next[fieldName as keyof ScopeInputValue<TSchema>]
    )
  }

  return value as ScopeValue<TSchema>
}

export const isScopeValueEmpty = <TSchema extends ScopeSchema>(
  schema: TSchema,
  value: ScopeValue<TSchema>
): boolean => {
  for (const fieldName in schema.fields) {
    if (!isEmptyFieldValue(
      schema.fields[fieldName]!,
      value[fieldName as keyof ScopeValue<TSchema>]
    )) {
      return false
    }
  }

  return true
}

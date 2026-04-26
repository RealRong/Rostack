export interface FlagScopeField {
  kind: 'flag'
}

export interface SetScopeField<TValue> {
  kind: 'set'
  __value?: TValue
}

export interface SlotScopeField<TValue> {
  kind: 'slot'
  __value?: TValue
}

export type ScopeField =
  | FlagScopeField
  | SetScopeField<unknown>
  | SlotScopeField<unknown>

export type ScopeFields = Record<string, ScopeField>

export interface ScopeSchema<TFields extends ScopeFields = ScopeFields> {
  kind: 'scope'
  fields: TFields
}

type ScopeFieldValue<TField extends ScopeField> =
  TField extends FlagScopeField
    ? boolean
    : TField extends SetScopeField<infer TValue>
      ? ReadonlySet<TValue>
      : TField extends SlotScopeField<infer TValue>
        ? TValue | undefined
        : never

type ScopeFieldInput<TField extends ScopeField> =
  TField extends FlagScopeField
    ? boolean
    : TField extends SetScopeField<infer TValue>
      ? Iterable<TValue> | ReadonlySet<TValue>
      : TField extends SlotScopeField<infer TValue>
        ? TValue
        : never

export type ScopeValue<TSchema> = TSchema extends ScopeSchema<infer TFields>
  ? {
      [K in keyof TFields]: ScopeFieldValue<TFields[K]>
    }
  : undefined

export type ScopeInputValue<TSchema> = TSchema extends ScopeSchema<infer TFields>
  ? Partial<{
      [K in keyof TFields]: ScopeFieldInput<TFields[K]>
    }>
  : undefined

export type PhaseScopeMap<TPhaseName extends string> = {
  [K in TPhaseName]: ScopeSchema | undefined
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

const FLAG_SCOPE_FIELD = {
  kind: 'flag'
} as const satisfies FlagScopeField

const SET_SCOPE_FIELD = {
  kind: 'set'
} as const satisfies SetScopeField<never>

const SLOT_SCOPE_FIELD = {
  kind: 'slot'
} as const satisfies SlotScopeField<never>

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

export const flag = (): FlagScopeField => FLAG_SCOPE_FIELD

export const set = <TValue,>(): SetScopeField<TValue> => (
  SET_SCOPE_FIELD as SetScopeField<TValue>
)

export const slot = <TValue,>(): SlotScopeField<TValue> => (
  SLOT_SCOPE_FIELD as SlotScopeField<TValue>
)

export const defineScope = <TFields extends ScopeFields>(
  fields: TFields
): ScopeSchema<TFields> => ({
  kind: 'scope',
  fields
})

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

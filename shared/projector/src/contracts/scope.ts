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

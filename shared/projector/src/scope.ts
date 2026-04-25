import type {
  FlagScopeField,
  ScopeFields,
  ScopeSchema,
  SetScopeField,
  SlotScopeField
} from './contracts/scope'

const FLAG_SCOPE_FIELD = {
  kind: 'flag'
} as const satisfies FlagScopeField

const SET_SCOPE_FIELD = {
  kind: 'set'
} as const satisfies SetScopeField<never>

const SLOT_SCOPE_FIELD = {
  kind: 'slot'
} as const satisfies SlotScopeField<never>

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

import {
  defineScope,
  flag,
  set,
  slot
} from './scope'

export type {
  FlagScopeField as InternalFlagScopeField,
  SetScopeField as InternalSetScopeField,
  SlotScopeField as InternalSlotScopeField,
  ScopeField as InternalScopeField,
  ScopeFields as InternalScopeFields,
  ScopeSchema as InternalScopeSchema,
  ScopeInputValue as InternalScopeInputValue,
  ScopeValue as InternalScopeValue
} from './scope'

export const createFlagScopeField = flag
export const createSetScopeField = set
export const createSlotScopeField = slot
export const createScopeSchema = defineScope

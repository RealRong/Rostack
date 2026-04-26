export { createPlan, mergePlans } from './plan'
export { createStageMetrics } from './metrics'
export {
  defineScope,
  flag,
  set,
  slot,
  isScopeValueEmpty,
  mergeScopeValue,
  normalizeScopeValue
} from './scope'
export {
  createProjectionRuntime,
  defineProjectionModel,
  family,
  value
} from './runtime'

export type {
  Action,
  Family,
  Flags,
  Revision
} from './core'
export type {
  Result as ProjectionPhaseResult,
  Spec as ProjectionPhase
} from './phase'
export type {
  DefaultPhaseScopeMap as DefaultProjectionScopeMap,
  FlagScopeField,
  PhaseScopeInput as ProjectionScopeInput,
  PhaseScopeMap as ProjectionScopeMap,
  ScopeField,
  ScopeFields,
  ScopeInputValue as ProjectionScopeInputValue,
  ScopeSchema as ProjectionScopeSchema,
  ScopeValue as ProjectionScopeValue,
  SetScopeField,
  SlotScopeField
} from './scope'
export type {
  Phase as ProjectionPhaseTrace,
  Run as ProjectionTrace
} from './trace'
export type {
  ProjectionModel,
  ProjectionPlan,
  ProjectionRuntime
} from './runtime'

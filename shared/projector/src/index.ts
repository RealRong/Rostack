export { createPlan, mergePlans } from './dirty/plan'
export { createProjector } from './projector/createProjector'

export type { Revision } from './contracts/core'
export type {
  Spec as ProjectorPhase
} from './contracts/phase'
export type {
  DefaultPhaseScopeMap as DefaultProjectorScopeMap,
  PhaseScopeMap as ProjectorScopeMap
} from './contracts/scope'
export type {
  Context as ProjectorContext,
  Planner as ProjectorPlanner,
  Publisher as ProjectorPublisher,
  Spec as ProjectorSpec
} from './contracts/projector'
export type { Run as ProjectorTrace } from './contracts/trace'

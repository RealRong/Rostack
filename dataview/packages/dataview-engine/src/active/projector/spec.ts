import {
  type ProjectorSpec
} from '@shared/projector'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type { ViewState } from '@dataview/engine/contracts/view'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActiveProjectorInput,
  ActiveProjectorWorking
} from '../contracts/projector'
import { activeMembershipPhase } from '../phases/membership'
import { activePublishPhase } from '../phases/publish'
import { activeQueryPhase } from '../phases/query'
import { activeSummaryPhase } from '../phases/summary'
import { createEmptyActiveSnapshot } from './createEmptySnapshot'
import { createActiveProjectorWorking } from './createWorking'
import { activeProjectorPlanner } from './planner'
import { activeProjectorPublisher } from './publisher'

export const activeProjectorSpec: ProjectorSpec<
  ActiveProjectorInput,
  ActiveProjectorWorking,
  ViewState | undefined,
  ActiveDelta | undefined,
  ActivePhaseName,
  ActivePhaseScopeMap,
  ActivePhaseMetrics
> = {
  createWorking: createActiveProjectorWorking,
  createSnapshot: createEmptyActiveSnapshot,
  plan: activeProjectorPlanner.plan,
  publish: activeProjectorPublisher.publish,
  phases: [
    activeQueryPhase,
    activeMembershipPhase,
    activeSummaryPhase,
    activePublishPhase
  ]
}

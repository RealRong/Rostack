import {
  defineProjectorSpec,
  type ProjectorSpec
} from '@shared/projector'
import type {
  Change,
  Input,
  Snapshot
} from '../contracts/editor'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import type { WorkingState } from '../contracts/working'
import { editorGraphPhases } from '../phases'
import { createEmptySnapshot } from './createEmptySnapshot'
import { createWorking } from './createWorking'
import type { EditorGraphPhaseMetrics } from './context'
import type { EditorPhaseName } from './phaseNames'
import { editorGraphPlanner } from './planner'
import { editorGraphPublisher } from './publisher'

export const editorGraphProjectorSpec: ProjectorSpec<
  Input,
  WorkingState,
  Snapshot,
  Change,
  EditorPhaseName,
  EditorPhaseScopeMap,
  undefined,
  EditorGraphPhaseMetrics
> = defineProjectorSpec({
  createWorking,
  createSnapshot: createEmptySnapshot,
  plan: editorGraphPlanner.plan,
  publish: editorGraphPublisher.publish,
  phases: editorGraphPhases
})

import type { ProjectorSpec } from '@shared/projector'
import type {
  Change,
  Input,
  Snapshot
} from '../contracts/editor'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import type { WorkingState } from '../contracts/working'
import { createEditorGraphPhases } from '../phases'
import { createEmptySnapshot } from './createEmptySnapshot'
import { createWorking } from './createWorking'
import { createEditorGraphPlanner } from './planner'
import { createEditorGraphPublisher } from './publisher'
import type { EditorPhaseName } from './phaseNames'

export const createEditorGraphProjectorSpec = (): ProjectorSpec<
  Input,
  WorkingState,
  Snapshot,
  Change,
  EditorPhaseName,
  EditorPhaseScopeMap,
  undefined,
  {
    count: number
  }
> => ({
  createWorking,
  createSnapshot: createEmptySnapshot,
  plan: createEditorGraphPlanner().plan,
  publish: createEditorGraphPublisher().publish,
  phases: createEditorGraphPhases()
})

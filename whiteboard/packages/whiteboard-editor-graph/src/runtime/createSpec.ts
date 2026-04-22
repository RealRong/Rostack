import type { RuntimeSpec } from '@shared/projection-runtime'
import type {
  Change,
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import { createEditorGraphPhases } from '../phases'
import { createEmptySnapshot } from './createEmptySnapshot'
import { createWorking } from './createWorking'
import { createEditorGraphPlanner } from './planner'
import { createEditorGraphPublisher } from './publisher'
import type { EditorPhaseName } from './phaseNames'

export const createEditorGraphRuntimeSpec = (): RuntimeSpec<
  Input,
  WorkingState,
  Snapshot,
  Change,
  EditorPhaseName,
  never,
  undefined,
  {
    count: number
  }
> => ({
  createWorking,
  createSnapshot: createEmptySnapshot,
  planner: createEditorGraphPlanner(),
  publisher: createEditorGraphPublisher(),
  phases: createEditorGraphPhases()
})

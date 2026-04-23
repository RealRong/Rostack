import type {
  PhaseSpec,
  RuntimeContext
} from '@shared/projection-runtime'
import type {
  EditorPhaseScopeMap,
  GraphPatchScope
} from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import type { EditorPhaseName } from '../runtime/phaseNames'

export type EditorContext = RuntimeContext<
  Input,
  WorkingState,
  Snapshot,
  undefined
>

export type GraphEditorContext = RuntimeContext<
  Input,
  WorkingState,
  Snapshot,
  GraphPatchScope
>

export type GraphEditorPhase = PhaseSpec<
  'graph',
  GraphEditorContext,
  undefined,
  {
    count: number
  },
  EditorPhaseName,
  EditorPhaseScopeMap
>

export type UiEditorPhase = PhaseSpec<
  'ui',
  EditorContext,
  undefined,
  {
    count: number
  },
  EditorPhaseName,
  EditorPhaseScopeMap
>

export type SceneEditorPhase = PhaseSpec<
  'scene',
  EditorContext,
  undefined,
  {
    count: number
  },
  EditorPhaseName,
  EditorPhaseScopeMap
>

export type EditorPhase =
  | GraphEditorPhase
  | UiEditorPhase
  | SceneEditorPhase

export const toMetric = (
  count: number
): { count: number } => ({
  count
})

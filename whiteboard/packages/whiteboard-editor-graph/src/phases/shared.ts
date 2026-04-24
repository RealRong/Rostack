import type {
  ProjectorContext,
  ProjectorPhase
} from '@shared/projector'
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
import type { SpatialPatchScope } from '../runtime/spatial/contracts'

export type EditorContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  undefined
>

export type GraphEditorContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  GraphPatchScope
>

export type GraphEditorPhase = ProjectorPhase<
  'graph',
  GraphEditorContext,
  undefined,
  {
    count: number
  },
  EditorPhaseName,
  EditorPhaseScopeMap
>

export type UiEditorPhase = ProjectorPhase<
  'ui',
  EditorContext,
  undefined,
  {
    count: number
  },
  EditorPhaseName,
  EditorPhaseScopeMap
>

export type SpatialEditorContext = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  SpatialPatchScope
>

export type SpatialEditorPhase = ProjectorPhase<
  'spatial',
  SpatialEditorContext,
  undefined,
  {
    count: number
  },
  EditorPhaseName,
  EditorPhaseScopeMap
>

export type ItemsEditorPhase = ProjectorPhase<
  'items',
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
  | SpatialEditorPhase
  | UiEditorPhase
  | ItemsEditorPhase

export const toMetric = (
  count: number
): { count: number } => ({
  count
})

import {
  definePhase,
  type ProjectorContext,
  type ProjectorPhase
} from '@shared/projector'
import type { EditorPhaseScopeMap } from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { WorkingState } from '../contracts/working'
import type { EditorPhaseName } from './phaseNames'

export interface EditorGraphPhaseMetrics {
  count: number
}

export type EditorGraphContext<TScope> = ProjectorContext<
  Input,
  WorkingState,
  Snapshot,
  TScope
>

export type EditorGraphPhase<
  TName extends EditorPhaseName
> = ProjectorPhase<
  TName,
  EditorGraphContext<EditorPhaseScopeMap[TName]>,
  undefined,
  EditorGraphPhaseMetrics,
  EditorPhaseName,
  EditorPhaseScopeMap
>

export const defineEditorGraphPhase = <
  TName extends EditorPhaseName
>(
  phase: EditorGraphPhase<TName>
): EditorGraphPhase<TName> => definePhase(phase)

export const toPhaseMetrics = (
  count: number
): EditorGraphPhaseMetrics => ({
  count
})

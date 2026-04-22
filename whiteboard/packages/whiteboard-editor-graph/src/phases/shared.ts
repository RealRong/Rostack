import type {
  PhaseSpec,
  RuntimeContext
} from '@shared/projection-runtime'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { Token } from '../contracts/impact'
import type { WorkingState } from '../contracts/working'
import type { EditorPhaseName } from '../runtime/phaseNames'

export type EditorContext = RuntimeContext<
  Input,
  WorkingState,
  Snapshot,
  Token
>

export type EditorPhase = PhaseSpec<
  EditorPhaseName,
  EditorContext,
  undefined,
  {
    count: number
  }
>

export const toMetric = (
  count: number
): { count: number } => ({
  count
})

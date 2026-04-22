import { createFlags } from '@shared/projection-runtime'
import type { Size } from '@whiteboard/core/types'
import type {
  ImpactInput,
  TextMeasureEntry
} from '../contracts/editor'

export type EditorGraphImpactFlags = Partial<Record<keyof ImpactInput, boolean>>

export const createEditorGraphImpact = (
  input: EditorGraphImpactFlags = {}
): ImpactInput => ({
  document: createFlags(input.document ?? false),
  session: createFlags(input.session ?? false),
  measure: createFlags(input.measure ?? false),
  interaction: createFlags(input.interaction ?? false),
  viewport: createFlags(input.viewport ?? false),
  clock: createFlags(input.clock ?? false)
})

export const createEditorGraphTextMeasureEntry = (
  size: Size,
  input: Partial<Pick<TextMeasureEntry, 'mode' | 'wrapWidth'>> = {}
): TextMeasureEntry => ({
  size,
  metrics: {
    width: size.width,
    height: size.height
  },
  mode: input.mode ?? 'multi-line',
  wrapWidth: input.wrapWidth
})

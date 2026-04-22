import { createFlags } from '@shared/projection-runtime'
import type { Size } from '@whiteboard/core/types'
import type {
  InputChange,
  TextMeasureEntry
} from '../contracts/editor'

export type EditorGraphInputChangeFlags = Partial<Record<keyof InputChange, boolean>>

export const createEditorGraphInputChange = (
  input: EditorGraphInputChangeFlags = {}
): InputChange => ({
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

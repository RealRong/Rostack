export type DrawMode =
  | 'pen'
  | 'highlighter'
  | 'eraser'

export type DrawBrush =
  | 'pen'
  | 'highlighter'

export type DrawSlot =
  | '1'
  | '2'
  | '3'

export const DRAW_MODES = [
  'pen',
  'highlighter',
  'eraser'
] as const satisfies readonly DrawMode[]

export const DRAW_BRUSHES = [
  'pen',
  'highlighter'
] as const satisfies readonly DrawBrush[]

export const DRAW_SLOTS = [
  '1',
  '2',
  '3'
] as const satisfies readonly DrawSlot[]

export const DEFAULT_DRAW_MODE: DrawMode = 'pen'
export const DEFAULT_DRAW_BRUSH: DrawBrush = DEFAULT_DRAW_MODE

export const DEFAULT_DRAW_OPACITY: Readonly<Record<DrawBrush, number>> = {
  pen: 1,
  highlighter: 0.35
}

export const isDrawMode = (
  value: string
): value is DrawMode => (
  value === 'pen'
  || value === 'highlighter'
  || value === 'eraser'
)

export const isDrawBrush = (
  value: string
): value is DrawBrush => (
  value === 'pen'
  || value === 'highlighter'
)

export const hasDrawBrush = (
  mode: DrawMode
): mode is DrawBrush => mode !== 'eraser'

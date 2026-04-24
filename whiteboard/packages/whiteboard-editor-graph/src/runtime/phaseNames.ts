export const EDITOR_PHASES = [
  'graph',
  'spatial',
  'ui',
  'items'
] as const

export type EditorPhaseName = typeof EDITOR_PHASES[number]

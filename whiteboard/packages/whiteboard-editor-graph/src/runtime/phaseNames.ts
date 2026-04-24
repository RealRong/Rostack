export const EDITOR_PHASES = [
  'graph',
  'spatial',
  'ui',
  'scene'
] as const

export type EditorPhaseName = typeof EDITOR_PHASES[number]

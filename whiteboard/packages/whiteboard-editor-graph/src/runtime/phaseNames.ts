export const EDITOR_PHASES = [
  'input',
  'graph',
  'measure',
  'structure',
  'tree',
  'element',
  'selection',
  'chrome',
  'scene'
] as const

export type EditorPhaseName = typeof EDITOR_PHASES[number]

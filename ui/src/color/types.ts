export const UI_OPTION_COLOR_IDS = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red'
] as const

export type UiOptionColorId = typeof UI_OPTION_COLOR_IDS[number]

export type UiOptionColorTokenUsage =
  | 'badge-bg'
  | 'badge-text'
  | 'badge-border'
  | 'column-bg'
  | 'column-border'
  | 'card-bg'
  | 'card-border'
  | 'card-bg-hover'
  | 'card-bg-pressed'
  | 'dot-bg'
  | 'text'
  | 'text-muted'

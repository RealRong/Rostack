export type ToolbarSelectionKind =
  | 'shape'
  | 'text'
  | 'sticky'
  | 'frame'
  | 'draw'
  | 'group'
  | 'mixed'
  | 'none'

export type ToolbarItemKey =
  | 'filter'
  | 'shape-kind'
  | 'font-size'
  | 'bold'
  | 'italic'
  | 'text-align'
  | 'text-color'
  | 'stroke'
  | 'fill'
  | 'lock'
  | 'more'

export type ToolbarRecipeItem =
  | { kind: 'item'; key: ToolbarItemKey }
  | { kind: 'divider' }

export type ToolbarPanelKey =
  | 'filter'
  | 'shape-kind'
  | 'font-size'
  | 'text-align'
  | 'text-color'
  | 'stroke'
  | 'fill'
  | 'more'

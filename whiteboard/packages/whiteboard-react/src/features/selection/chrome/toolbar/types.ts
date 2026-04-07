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
  | 'shape-kind'
  | 'font-size'
  | 'bold'
  | 'italic'
  | 'text-align'
  | 'text-color'
  | 'stroke'
  | 'fill'
  | 'align'
  | 'distribute'
  | 'order'
  | 'group'
  | 'lock'
  | 'more'

export type ToolbarRecipeItem =
  | { kind: 'item'; key: ToolbarItemKey }
  | { kind: 'divider' }

export type ToolbarPanelKey =
  | 'shape-kind'
  | 'font-size'
  | 'text-align'
  | 'text-color'
  | 'stroke'
  | 'fill'
  | 'more'

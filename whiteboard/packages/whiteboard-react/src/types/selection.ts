export type ToolbarItemKey =
  | 'fill'
  | 'stroke'
  | 'text'
  | 'layout'
  | 'more'

export type ToolbarPlacement = 'top' | 'bottom'

export type ToolbarItem = {
  key: ToolbarItemKey
  label: string
  active: boolean
}

export type ToolbarMenuAnchor = {
  top: number
  bottom: number
  centerX: number
}

export type MenuOpenSnapshot = {
  x: number
  y: number
  time: number
}

export type ContextMenuPlacement = {
  left: number
  top: number
  transform: string
  submenuSide: 'left' | 'right'
}

export type ToolbarIconState = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
}

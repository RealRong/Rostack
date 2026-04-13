export interface CellChromeState {
  selection: boolean
  frame: boolean
  hover: boolean
  fill: boolean
}

export const cellChrome = (input: {
  selected: boolean
  frameActive: boolean
  hovered: boolean
  fillHandleActive: boolean
  selectionVisible?: boolean
}): CellChromeState => ({
  selection: (input.selectionVisible ?? true) && input.selected,
  frame: (input.selectionVisible ?? true) && input.frameActive,
  hover: input.hovered && !input.selected,
  fill: (input.selectionVisible ?? true) && input.fillHandleActive
})

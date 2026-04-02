export interface RowRailStateInput {
  dragActive: boolean
  dragDisabled: boolean
  marqueeActive: boolean
  hovered: boolean
  selected: boolean
}

export interface RowRailState {
  selection: 'hidden' | 'ghost' | 'visible'
  drag: 'hidden' | 'visible'
}

export const rowRailState = (
  input: RowRailStateInput
): RowRailState => {
  if (input.dragActive) {
    return {
      selection: 'ghost',
      drag: 'hidden'
    }
  }

  if (input.marqueeActive) {
    return {
      selection: input.selected ? 'visible' : 'ghost',
      drag: 'hidden'
    }
  }

  return {
    selection: (
      input.selected
      || input.hovered
    )
      ? 'visible'
      : 'ghost',
    drag: input.hovered && !input.dragDisabled
      ? 'visible'
      : 'hidden'
  }
}

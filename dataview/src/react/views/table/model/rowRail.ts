export interface RowRailStateInput {
  dragActive: boolean
  dragDisabled: boolean
  marqueeActive: boolean
  exposed: boolean
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
      || input.exposed
    )
      ? 'visible'
      : 'ghost',
    drag: input.exposed && !input.dragDisabled
      ? 'visible'
      : 'hidden'
  }
}

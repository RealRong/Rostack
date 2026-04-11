import {
  EMPTY_SELECTION_TARGET,
  applySelectionTarget,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  type SelectionInput,
  type SelectionTarget
} from '@whiteboard/core/selection'
import {
  createValueStore,
  type ValueStore
} from '@shared/core'

export type SelectionMutate = {
  replace: (input: SelectionInput) => void
  add: (input: SelectionInput) => void
  remove: (input: SelectionInput) => void
  toggle: (input: SelectionInput) => void
  clear: () => void
}

export type SelectionState = {
  source: ValueStore<SelectionTarget>
  mutate: SelectionMutate
}

export const createSelectionState = (): SelectionState => {
  const source = createValueStore<SelectionTarget>(EMPTY_SELECTION_TARGET, {
    isEqual: isSelectionTargetEqual
  })
  const readSource = () => source.get()
  const writeSource = (next: SelectionTarget) => {
    if (isSelectionTargetEqual(readSource(), next)) {
      return
    }

    source.set(next)
  }

  return {
    source,
    mutate: {
      replace: (input: SelectionInput) => {
        writeSource(normalizeSelectionTarget(input))
      },
      add: (input: SelectionInput) => {
        writeSource(applySelectionTarget(readSource(), input, 'add'))
      },
      remove: (input: SelectionInput) => {
        writeSource(applySelectionTarget(readSource(), input, 'subtract'))
      },
      toggle: (input: SelectionInput) => {
        writeSource(applySelectionTarget(readSource(), input, 'toggle'))
      },
      clear: () => {
        writeSource(EMPTY_SELECTION_TARGET)
      }
    }
  }
}

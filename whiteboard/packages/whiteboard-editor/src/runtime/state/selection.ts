import {
  EMPTY_SELECTION_TARGET,
  applySelectionTarget,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  type SelectionInput,
  type SelectionTarget
} from '@whiteboard/core/selection'
import {
  type ValueStore
} from '@shared/core'
import { createCommandState } from './store'

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
  const state = createCommandState<SelectionTarget>({
    initial: EMPTY_SELECTION_TARGET,
    isEqual: isSelectionTargetEqual
  })
  const source = state.store

  return {
    source,
    mutate: {
      replace: (input: SelectionInput) => {
        state.set(normalizeSelectionTarget(input))
      },
      add: (input: SelectionInput) => {
        state.set(applySelectionTarget(state.read(), input, 'add'))
      },
      remove: (input: SelectionInput) => {
        state.set(applySelectionTarget(state.read(), input, 'subtract'))
      },
      toggle: (input: SelectionInput) => {
        state.set(applySelectionTarget(state.read(), input, 'toggle'))
      },
      clear: () => {
        state.set(EMPTY_SELECTION_TARGET)
      }
    }
  }
}

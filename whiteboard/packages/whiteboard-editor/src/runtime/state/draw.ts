import type { ValueStore } from '@shared/core'
import type { BrushStylePatch } from '../../draw/state'
import type { DrawBrush, DrawSlot } from '../../draw/model'
import {
  isDrawStateEqual,
  normalizeDrawState,
  patchDrawStyle,
  setDrawSlot,
  type DrawState as DrawStateValue
} from '../../draw/state'
import { createCommandState } from './store'

type DrawStateStoreCommands = {
  set: (state: DrawStateValue) => void
  slot: (brush: DrawBrush, slot: DrawSlot) => void
  patch: (brush: DrawBrush, slot: DrawSlot, patch: BrushStylePatch) => void
}

export type DrawStateStore = {
  store: ValueStore<DrawStateValue>
  commands: DrawStateStoreCommands
}

export const createDrawStateStore = (
  initialState: DrawStateValue
): DrawStateStore => {
  const state = createCommandState<DrawStateValue>({
    initial: initialState,
    normalize: normalizeDrawState,
    isEqual: isDrawStateEqual
  })
  const store = state.store

  return {
    store,
    commands: {
      set: (nextState) => {
        state.set(nextState)
      },
      slot: (kind, slot) => {
        state.update((current) => setDrawSlot(current, kind, slot))
      },
      patch: (kind, slot, patch) => {
        state.update((current) => patchDrawStyle(current, kind, slot, patch))
      }
    }
  }
}

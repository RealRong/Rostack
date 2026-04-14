import type { ValueStore } from '@shared/core'
import type { BrushStylePatch } from '@whiteboard/editor/local/draw/state'
import type { DrawBrush, DrawSlot } from '@whiteboard/editor/local/draw/model'
import {
  isDrawStateEqual,
  normalizeDrawState,
  patchDrawStyle,
  setDrawSlot,
  type DrawState as DrawStateValue
} from '@whiteboard/editor/local/draw/state'
import { createCommandState } from '@whiteboard/editor/local/session/store'

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

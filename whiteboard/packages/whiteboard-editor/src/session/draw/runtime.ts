import { store as sharedStore } from '@shared/core'
import type { BrushStylePatch } from '@whiteboard/editor/session/draw/state'
import type { DrawBrush, DrawSlot } from '@whiteboard/editor/session/draw/model'
import {
  isDrawStateEqual,
  normalizeDrawState,
  patchDrawStyle,
  setDrawSlot,
  type DrawState as DrawStateValue
} from '@whiteboard/editor/session/draw/state'

type DrawStateStoreCommands = {
  set: (state: DrawStateValue) => void
  slot: (brush: DrawBrush, slot: DrawSlot) => void
  patch: (brush: DrawBrush, slot: DrawSlot, patch: BrushStylePatch) => void
}

export type DrawStateStore = {
  store: sharedStore.ValueStore<DrawStateValue>
  commands: DrawStateStoreCommands
}

export const createDrawStateStore = (
  initialState: DrawStateValue
): DrawStateStore => {
  const state = sharedStore.createNormalizedValue<DrawStateValue>({
    initial: initialState,
    normalize: normalizeDrawState,
    isEqual: isDrawStateEqual
  })
  const source = state.store

  return {
    store: source,
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

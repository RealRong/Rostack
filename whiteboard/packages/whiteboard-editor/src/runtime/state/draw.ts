import { createValueStore, type ValueStore } from '@whiteboard/engine'
import {
  DRAW_SLOTS,
  normalizeDrawPreferences
} from '../../draw/model'
import type {
  BrushStyle,
  DrawBrush,
  DrawCommands,
  DrawPreferences
} from '../../types/draw'

export type DrawPreferencesState = {
  store: ValueStore<DrawPreferences>
  commands: DrawCommands
}

const normalizeStyle = (
  value: BrushStyle
): BrushStyle => ({
  color: typeof value.color === 'string' && value.color.trim()
    ? value.color
    : 'currentColor',
  width: Number.isFinite(value.width)
    ? Math.max(1, value.width)
    : 1
})

const isSameStyle = (
  left: BrushStyle,
  right: BrushStyle
) => (
  left.color === right.color
  && left.width === right.width
)

const isSameBrush = (
  left: DrawBrush,
  right: DrawBrush
) => (
  left === right
  || (
    left.slot === right.slot
    && DRAW_SLOTS.every((slot) => isSameStyle(left.slots[slot], right.slots[slot]))
  )
)

export const createDrawPreferencesState = (
  initialPreferences: DrawPreferences
): DrawPreferencesState => {
  const store = createValueStore<DrawPreferences>(
    normalizeDrawPreferences(initialPreferences)
  )

  return {
    store,
    commands: {
      slot: (kind, slot) => {
        store.update((current) => {
          const previous = current[kind]
          if (previous.slot === slot) {
            return current
          }

          const next = {
            ...previous,
            slot
          }

          return isSameBrush(previous, next)
            ? current
            : {
                ...current,
                [kind]: next
              }
        })
      },
      patch: (kind, slot, patch) => {
        store.update((current) => {
          const previous = current[kind]
          const currentStyle = previous.slots[slot]
          const nextStyle = normalizeStyle({
            color: patch.color ?? currentStyle.color,
            width: patch.width ?? currentStyle.width
          })

          if (isSameStyle(currentStyle, nextStyle)) {
            return current
          }

          return {
            ...current,
            [kind]: {
              ...previous,
              slots: {
                ...previous.slots,
                [slot]: nextStyle
              }
            }
          }
        })
      }
    }
  }
}

import { createValueStore, type ValueStore } from '@shared/core'
import { DRAW_SLOTS } from '../../draw'
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

const normalizeBrush = (
  brush: DrawBrush
): DrawBrush => {
  const slot = DRAW_SLOTS.includes(brush.slot)
    ? brush.slot
    : DRAW_SLOTS[0]

  return {
    slot,
    slots: {
      '1': normalizeStyle(brush.slots['1']),
      '2': normalizeStyle(brush.slots['2']),
      '3': normalizeStyle(brush.slots['3'])
    }
  }
}

const normalizeDrawPreferences = (
  value: DrawPreferences
): DrawPreferences => ({
  pen: normalizeBrush(value.pen),
  highlighter: normalizeBrush(value.highlighter)
})

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
      set: (preferences) => {
        const next = normalizeDrawPreferences(preferences)
        const current = store.get()
        if (
          isSameBrush(current.pen, next.pen)
          && isSameBrush(current.highlighter, next.highlighter)
        ) {
          return
        }

        store.set(next)
      },
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

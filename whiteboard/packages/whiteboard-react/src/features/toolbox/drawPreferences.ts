import type { DrawPreferences } from '@whiteboard/editor/draw'

export const DEFAULT_DRAW_PREFERENCES: DrawPreferences = {
  pen: {
    slot: '1',
    slots: {
      '1': {
        color: 'var(--ui-text-primary)',
        width: 2
      },
      '2': {
        color: 'var(--ui-blue-text)',
        width: 4
      },
      '3': {
        color: 'var(--ui-purple-text)',
        width: 8
      }
    }
  },
  highlighter: {
    slot: '1',
    slots: {
      '1': {
        color: 'var(--ui-yellow-bg-strong)',
        width: 12
      },
      '2': {
        color: 'var(--ui-green-bg-strong)',
        width: 12
      },
      '3': {
        color: 'var(--ui-pink-bg-strong)',
        width: 12
      }
    }
  }
}

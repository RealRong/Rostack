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
        color: 'var(--ui-blue-text-secondary)',
        width: 4
      },
      '3': {
        color: 'var(--ui-purple-text-secondary)',
        width: 8
      }
    }
  },
  highlighter: {
    slot: '1',
    slots: {
      '1': {
        color: 'var(--ui-yellow-text-secondary)',
        width: 12
      },
      '2': {
        color: 'var(--ui-green-text-secondary)',
        width: 12
      },
      '3': {
        color: 'var(--ui-pink-text-secondary)',
        width: 12
      }
    }
  }
}

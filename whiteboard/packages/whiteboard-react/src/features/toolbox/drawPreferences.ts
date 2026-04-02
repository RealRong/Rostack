import type { DrawPreferences } from '@whiteboard/editor/draw'

export const DEFAULT_DRAW_PREFERENCES: DrawPreferences = {
  pen: {
    slot: '1',
    slots: {
      '1': {
        color: 'hsl(var(--ui-text-primary, 40 2.1% 28%))',
        width: 2
      },
      '2': {
        color: 'hsl(var(--tag-blue-foreground, 206.5 74.4% 52.5%))',
        width: 4
      },
      '3': {
        color: 'hsl(var(--tag-purple-foreground, 278.6 32.7% 56.3%))',
        width: 8
      }
    }
  },
  highlighter: {
    slot: '1',
    slots: {
      '1': {
        color: 'hsl(var(--tag-yellow-background, 47.6 70.7% 92%))',
        width: 12
      },
      '2': {
        color: 'hsl(var(--tag-green-background, 146.7 24.3% 92.7%))',
        width: 12
      },
      '3': {
        color: 'hsl(var(--tag-pink-background, 331.8 63% 94.7%))',
        width: 12
      }
    }
  }
}

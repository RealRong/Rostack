export const COLOR_OPTIONS = [
  { label: 'Ink', value: 'var(--ui-text-primary)' },
  { label: 'White', value: 'var(--ui-surface)' },
  { label: 'Gray', value: 'var(--ui-surface-muted)' },
  { label: 'Yellow', value: 'var(--ui-yellow-bg-strong)' },
  { label: 'Red', value: 'var(--ui-red-bg-strong)' },
  { label: 'Blue', value: 'var(--ui-blue-bg-strong)' },
  { label: 'Green', value: 'var(--ui-green-bg-strong)' },
  { label: 'Purple', value: 'var(--ui-purple-bg-strong)' },
  { label: 'Pink', value: 'var(--ui-pink-bg-strong)' },
  { label: 'Slate', value: 'var(--ui-text-secondary)' },
  { label: 'Danger', value: 'var(--ui-danger)' },
  { label: 'Orange', value: 'var(--ui-orange-text)' },
  { label: 'Forest', value: 'var(--ui-green-text)' },
  { label: 'Accent', value: 'var(--ui-accent)' },
  { label: 'Violet', value: 'var(--ui-purple-text)' }
] as const

export const COLORS = COLOR_OPTIONS.map((option) => option.value)

export const STROKE_WIDTHS = [1, 2, 4, 6, 8, 12] as const
export const DRAW_STROKE_WIDTHS = [2, 4, 8, 12] as const

export const OPACITY_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '70%', value: 0.7 },
  { label: '50%', value: 0.5 },
  { label: '35%', value: 0.35 }
] as const

export const FONT_SIZES = [14, 16, 20, 24] as const

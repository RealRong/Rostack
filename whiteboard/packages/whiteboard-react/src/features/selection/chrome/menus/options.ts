export const COLOR_OPTIONS = [
  { label: 'Ink', value: 'hsl(var(--ui-text-primary, 40 2.1% 28%))' },
  { label: 'White', value: 'hsl(var(--ui-surface, 0 0% 100%))' },
  { label: 'Gray', value: 'hsl(var(--ui-surface-muted, 40 9.1% 93.5%))' },
  { label: 'Yellow', value: 'hsl(var(--tag-yellow-background, 47.6 70.7% 92%))' },
  { label: 'Red', value: 'hsl(var(--tag-red-background, 5.7 77.8% 94.7%))' },
  { label: 'Blue', value: 'hsl(var(--tag-blue-background, 206.1 79.3% 94.3%))' },
  { label: 'Green', value: 'hsl(var(--tag-green-background, 146.7 24.3% 92.7%))' },
  { label: 'Purple', value: 'hsl(var(--tag-purple-background, 274.3 53.8% 94.9%))' },
  { label: 'Pink', value: 'hsl(var(--tag-pink-background, 331.8 63% 94.7%))' },
  { label: 'Slate', value: 'hsl(var(--ui-text-secondary, 37.5 3.3% 47.5%))' },
  { label: 'Danger', value: 'hsl(var(--ui-danger, 4 58.4% 54.7%))' },
  { label: 'Orange', value: 'hsl(var(--tag-orange-foreground, 28.4 64.7% 50%))' },
  { label: 'Forest', value: 'hsl(var(--tag-green-foreground, 146.5 29.8% 44.7%))' },
  { label: 'Accent', value: 'hsl(var(--ui-accent, 209.8 76.7% 51.2%))' },
  { label: 'Violet', value: 'hsl(var(--tag-purple-foreground, 278.6 32.7% 56.3%))' }
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

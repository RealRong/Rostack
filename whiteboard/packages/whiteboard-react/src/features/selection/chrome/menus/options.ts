import {
  UI_CONTENT_COLOR_FAMILIES,
  resolveOptionColorToken
} from '@ui'

type ColorOption = {
  label: string
  value: string
}

const createFamilyColorOptions = (
  usage: 'surface' | 'text-secondary'
): readonly ColorOption[] => UI_CONTENT_COLOR_FAMILIES.map((family) => ({
  label: family.label,
  value: resolveOptionColorToken(family.id, usage)
}))

const FAMILY_FILL_COLOR_OPTIONS = createFamilyColorOptions('surface')

const FAMILY_TEXT_COLOR_OPTIONS = UI_CONTENT_COLOR_FAMILIES
  .filter((family) => family.id !== 'yellow')
  .map((family) => ({
    label: family.label,
    value: resolveOptionColorToken(family.id, 'text-secondary')
  }))

export const FILL_COLOR_OPTIONS: readonly ColorOption[] = [
  {
    label: 'Default',
    value: resolveOptionColorToken('default', 'surface')
  },
  ...FAMILY_FILL_COLOR_OPTIONS
]

export const STROKE_COLOR_OPTIONS: readonly ColorOption[] = [
  {
    label: 'Ink',
    value: 'var(--ui-text-primary)'
  },
  ...createFamilyColorOptions('text-secondary')
]

export const TEXT_COLOR_OPTIONS: readonly ColorOption[] = [
  {
    label: 'Ink',
    value: 'var(--ui-text-primary)'
  },
  ...FAMILY_TEXT_COLOR_OPTIONS
]

export const DRAW_COLOR_OPTIONS = STROKE_COLOR_OPTIONS

export const STROKE_WIDTHS = [1, 2, 4, 6, 8, 12] as const
export const DRAW_STROKE_WIDTHS = [2, 4, 8, 12] as const

export const OPACITY_OPTIONS = [
  { label: '100%', value: 1 },
  { label: '70%', value: 0.7 },
  { label: '50%', value: 0.5 },
  { label: '35%', value: 0.35 }
] as const

export const FONT_SIZES = [14, 16, 20, 24] as const

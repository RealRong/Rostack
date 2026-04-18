import {
  WHITEBOARD_BG_PALETTE_INDICES,
  WHITEBOARD_BORDER_PALETTE_INDICES,
  WHITEBOARD_LINE_PALETTE_INDICES,
  WHITEBOARD_STICKY_PALETTE_INDICES,
  WHITEBOARD_TEXT_PALETTE_INDICES,
  createWhiteboardPaletteKey,
  resolveWhiteboardPaletteValue,
  type WhiteboardPaletteGroup
} from '@whiteboard/product/palette'

type WhiteboardPaletteSection = {
  key: string
  indices: readonly number[]
}

export type WhiteboardColorOption = {
  label: string
  value: string
  color?: string
  ariaLabel?: string
  transparent?: boolean
}

const range = (
  start: number,
  end: number
) => Array.from({
  length: end - start + 1
}, (_, index) => start + index)

const BG_PALETTE_SECTIONS: readonly WhiteboardPaletteSection[] = [
  {
    key: 'neutral',
    indices: range(0, 8)
  },
  {
    key: 'classic-muted',
    indices: range(9, 18)
  },
  {
    key: 'classic-vivid',
    indices: range(19, 28)
  }
] as const

const BORDER_PALETTE_SECTIONS: readonly WhiteboardPaletteSection[] = [
  {
    key: 'neutral',
    indices: range(0, 9)
  },
  {
    key: 'classic-muted',
    indices: range(10, 19)
  },
  {
    key: 'classic-vivid',
    indices: range(20, 29)
  }
] as const

const STICKY_PALETTE_SECTIONS: readonly WhiteboardPaletteSection[] = [
  {
    key: 'neutral',
    indices: range(0, 9)
  },
  {
    key: 'classic-muted',
    indices: range(10, 19)
  },
  {
    key: 'classic-vivid',
    indices: range(20, 29)
  }
] as const

const TEXT_PALETTE_SECTIONS: readonly WhiteboardPaletteSection[] = [
  {
    key: 'neutral',
    indices: range(0, 9)
  },
  {
    key: 'classic',
    indices: range(10, 19)
  }
] as const

const createPaletteOptions = (
  group: WhiteboardPaletteGroup,
  indices: readonly number[]
): readonly WhiteboardColorOption[] => indices.map((index) => {
  const value = createWhiteboardPaletteKey(group, index)

  return {
    label: `${group} ${index}`,
    value,
    color: resolveWhiteboardPaletteValue(value),
    ariaLabel: `${group} ${index}`
  }
})

const flattenSections = (
  sections: readonly WhiteboardPaletteSection[]
) => sections.flatMap((section) => section.indices)

const BG_PALETTE_OPTIONS = createPaletteOptions(
  'bg',
  flattenSections(BG_PALETTE_SECTIONS).filter((index) => WHITEBOARD_BG_PALETTE_INDICES.includes(index))
)

const BORDER_PALETTE_OPTIONS = createPaletteOptions(
  'border',
  flattenSections(BORDER_PALETTE_SECTIONS).filter((index) => WHITEBOARD_BORDER_PALETTE_INDICES.includes(index))
)

const STICKY_PALETTE_OPTIONS = createPaletteOptions(
  'sticky',
  flattenSections(STICKY_PALETTE_SECTIONS).filter((index) => WHITEBOARD_STICKY_PALETTE_INDICES.includes(index))
)

const TEXT_PALETTE_OPTIONS = createPaletteOptions(
  'text',
  flattenSections(TEXT_PALETTE_SECTIONS).filter((index) => WHITEBOARD_TEXT_PALETTE_INDICES.includes(index))
)

const LINE_PALETTE_OPTIONS = createPaletteOptions(
  'line',
  flattenSections(BORDER_PALETTE_SECTIONS).filter((index) => WHITEBOARD_LINE_PALETTE_INDICES.includes(index))
)

export const WHITEBOARD_PALETTE_GRID_COLUMNS = 10
export const WHITEBOARD_PALETTE_SWATCH_SHAPE = 'square' as const

export const WHITEBOARD_FILL_COLOR_OPTIONS: readonly WhiteboardColorOption[] = [
  {
    label: 'Transparent',
    value: 'transparent',
    ariaLabel: 'transparent',
    transparent: true
  },
  ...BG_PALETTE_OPTIONS
]

export const WHITEBOARD_STICKY_FILL_OPTIONS: readonly WhiteboardColorOption[] = STICKY_PALETTE_OPTIONS

export const WHITEBOARD_STROKE_COLOR_OPTIONS: readonly WhiteboardColorOption[] = BORDER_PALETTE_OPTIONS
export const WHITEBOARD_LINE_COLOR_OPTIONS: readonly WhiteboardColorOption[] = LINE_PALETTE_OPTIONS

export const WHITEBOARD_TEXT_COLOR_OPTIONS: readonly WhiteboardColorOption[] = TEXT_PALETTE_OPTIONS

export const WHITEBOARD_DRAW_COLOR_OPTIONS = WHITEBOARD_STROKE_COLOR_OPTIONS

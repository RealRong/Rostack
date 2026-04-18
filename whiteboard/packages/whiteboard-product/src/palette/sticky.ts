import {
  WHITEBOARD_STICKY_RECTANGLE_SIZE,
  WHITEBOARD_STICKY_SQUARE_SIZE
} from '@whiteboard/product/node/templates'
import {
  WHITEBOARD_STICKY_TONE_PRESETS,
  resolveWhiteboardPaletteValue
} from '@whiteboard/product/palette'

const STICKY_TONE_LABELS = [
  'Soft yellow',
  'Soft mint',
  'Soft blue',
  'Soft pink',
  'Yellow',
  'Green',
  'Blue',
  'Magenta'
] as const

export type StickyTone = {
  key: string
  id: string
  label: string
  fillKey: string
  fill: string
  borderKey: string
  border: string
}

export type StickyFormat = {
  key: 'square' | 'rectangle'
  label: string
  title: string
  width: number
  height: number
  columns: number
  aspectClassName: string
}

export type StickyInsertOption = {
  key: string
  label: string
  tone: StickyTone
  format: StickyFormat
}

export const STICKY_TONE_OPTIONS: readonly StickyTone[] = WHITEBOARD_STICKY_TONE_PRESETS.map((preset, offset) => ({
  key: `sticky-tone.${preset.id}`,
  id: preset.id,
  label: STICKY_TONE_LABELS[offset] ?? `Sticky ${preset.id}`,
  fillKey: preset.fillKey,
  fill: resolveWhiteboardPaletteValue(preset.fillKey) ?? preset.fillKey,
  borderKey: preset.strokeKey,
  border: resolveWhiteboardPaletteValue(preset.strokeKey) ?? preset.strokeKey
}))

export const STICKY_FORMAT_OPTIONS: readonly StickyFormat[] = [
  {
    key: 'square',
    label: '1:1',
    title: 'Square (1:1)',
    width: WHITEBOARD_STICKY_SQUARE_SIZE.width,
    height: WHITEBOARD_STICKY_SQUARE_SIZE.height,
    columns: 4,
    aspectClassName: 'aspect-square'
  },
  {
    key: 'rectangle',
    label: 'Rectangle 2:1',
    title: 'Rectangle (2:1)',
    width: WHITEBOARD_STICKY_RECTANGLE_SIZE.width,
    height: WHITEBOARD_STICKY_RECTANGLE_SIZE.height,
    columns: 2,
    aspectClassName: 'aspect-[2/1]'
  }
] as const

export const STICKY_INSERT_OPTIONS: readonly StickyInsertOption[] = STICKY_FORMAT_OPTIONS.flatMap((format) =>
  STICKY_TONE_OPTIONS.map((tone) => ({
    key: `sticky.${format.key}.${tone.id}`,
    label: `${tone.label} ${format.label}`,
    tone,
    format
  }))
)

const STICKY_TONE_INDEX = new Map<string, StickyTone>(
  STICKY_TONE_OPTIONS.map((tone) => [tone.key, tone] as const)
)

const STICKY_FORMAT_INDEX = new Map<string, StickyFormat>(
  STICKY_FORMAT_OPTIONS.map((format) => [format.key, format] as const)
)

const STICKY_INSERT_OPTION_INDEX = new Map(
  STICKY_INSERT_OPTIONS.map((option) => [option.key, option] as const)
)

export const DEFAULT_STICKY_INSERT_OPTION_KEY = STICKY_INSERT_OPTIONS[0]?.key ?? 'sticky.square.13'

export const getStickyInsertPresetKey = ({
  toneKey,
  formatKey
}: {
  toneKey?: string
  formatKey?: string
}): string => {
  const tone = toneKey ? STICKY_TONE_INDEX.get(toneKey) : undefined
  const format = formatKey ? STICKY_FORMAT_INDEX.get(formatKey) : undefined
  const toneId = tone?.id ?? STICKY_TONE_OPTIONS[0]?.id ?? '13'
  const nextFormat = format?.key ?? STICKY_FORMAT_OPTIONS[0]?.key ?? 'square'

  return STICKY_INSERT_OPTION_INDEX.get(`sticky.${nextFormat}.${toneId}`)?.key
    ?? DEFAULT_STICKY_INSERT_OPTION_KEY
}

export const readStickyInsertOption = (
  key: string | undefined
): StickyInsertOption | undefined => key
  ? STICKY_INSERT_OPTION_INDEX.get(key)
  : undefined

export const readStickyInsertTone = (
  key: string | undefined
) => readStickyInsertOption(key)?.tone

export const readStickyInsertFormat = (
  key: string | undefined
) => readStickyInsertOption(key)?.format

export const STICKY_MENU_SECTIONS = STICKY_FORMAT_OPTIONS.map((format) => ({
  key: format.key,
  title: format.title,
  columns: format.columns,
  aspectClassName: format.aspectClassName,
  items: STICKY_TONE_OPTIONS.map((tone) => ({
    key: getStickyInsertPresetKey({
      toneKey: tone.key,
      formatKey: format.key
    }),
    label: `${format.title} ${tone.label}`,
    title: tone.label,
    fill: tone.fill,
    border: tone.border
  }))
}))

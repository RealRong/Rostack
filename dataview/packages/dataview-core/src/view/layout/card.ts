import type {
  CardLayout,
  CardOptions,
  CardSize
} from '@dataview/core/types/state'
import { json } from '@shared/core'

const DEFAULT_WRAP = false
const DEFAULT_SIZE: CardSize = 'md'

const normalizeSize = (
  value: unknown
): CardSize => {
  switch (value) {
    case 'sm':
    case 'lg':
      return value
    default:
      return DEFAULT_SIZE
  }
}

const normalizeLayout = (
  value: unknown,
  defaultLayout: CardLayout
): CardLayout => (
  value === 'compact' || value === 'stacked'
    ? value
    : defaultLayout
)

export const normalizeCardOptions = (
  value: unknown,
  defaults: {
    layout: CardLayout
  }
): CardOptions => {
  const card = json.isJsonObject(value) ? value : undefined

  return {
    wrap: typeof card?.wrap === 'boolean'
      ? card.wrap
      : DEFAULT_WRAP,
    size: normalizeSize(card?.size),
    layout: normalizeLayout(card?.layout, defaults.layout)
  }
}

export const cloneCardOptions = (
  options: CardOptions
): CardOptions => ({
  wrap: options.wrap,
  size: options.size,
  layout: options.layout
})

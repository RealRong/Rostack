import type {
  GalleryCardSize,
  GalleryOptions
} from '#core/contracts/gallery'
import { isJsonObject } from '#core/view/shared'

const DEFAULT_CARD_SIZE: GalleryCardSize = 'md'
const DEFAULT_SHOW_FIELD_LABELS = true

const normalizeCardSize = (value: unknown): GalleryCardSize => {
  switch (value) {
    case 'sm':
    case 'lg':
      return value
    default:
      return DEFAULT_CARD_SIZE
  }
}

export const normalizeGalleryOptions = (
  value: unknown
): GalleryOptions => {
  const gallery = isJsonObject(value) ? value : undefined
  return {
    showFieldLabels: typeof gallery?.showFieldLabels === 'boolean'
      ? gallery.showFieldLabels
      : DEFAULT_SHOW_FIELD_LABELS,
    cardSize: normalizeCardSize(gallery?.cardSize)
  }
}

export const cloneGalleryOptions = (
  options: GalleryOptions
): GalleryOptions => ({
  showFieldLabels: options.showFieldLabels,
  cardSize: options.cardSize
})

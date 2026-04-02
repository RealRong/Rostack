import type {
  GroupGalleryCardSize,
  GroupGalleryOptions
} from '../contracts/gallery'
import { isJsonObject } from './shared'

const DEFAULT_CARD_SIZE: GroupGalleryCardSize = 'md'
const DEFAULT_SHOW_FIELD_LABELS = true

const normalizeCardSize = (value: unknown): GroupGalleryCardSize => {
  switch (value) {
    case 'sm':
    case 'lg':
      return value
    default:
      return DEFAULT_CARD_SIZE
  }
}

export const normalizeGroupGalleryOptions = (
  value: unknown
): GroupGalleryOptions => {
  const gallery = isJsonObject(value) ? value : undefined
  return {
    showPropertyLabels: typeof gallery?.showPropertyLabels === 'boolean'
      ? gallery.showPropertyLabels
      : DEFAULT_SHOW_FIELD_LABELS,
    cardSize: normalizeCardSize(gallery?.cardSize)
  }
}

export const cloneGroupGalleryOptions = (
  options: GroupGalleryOptions
): GroupGalleryOptions => ({
  showPropertyLabels: options.showPropertyLabels,
  cardSize: options.cardSize
})

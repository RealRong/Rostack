import type { GalleryOptions } from '@dataview/core/types/state'
import { cloneCardOptions, normalizeCardOptions } from '@dataview/core/view/card'
import { isJsonObject } from '@dataview/core/view/shared'

export const normalizeGalleryOptions = (
  value: unknown
): GalleryOptions => {
  const gallery = isJsonObject(value) ? value : undefined
  return {
    card: normalizeCardOptions(gallery?.card, {
      layout: 'stacked'
    })
  }
}

export const cloneGalleryOptions = (
  options: GalleryOptions
): GalleryOptions => ({
  card: cloneCardOptions(options.card)
})

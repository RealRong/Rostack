import type { GalleryOptions } from '@dataview/core/types/state'
import { json } from '@shared/core'
import { cloneCardOptions, normalizeCardOptions } from '@dataview/core/view/layout/card'

export const normalizeGalleryOptions = (
  value: unknown
): GalleryOptions => {
  const gallery = json.isJsonObject(value) ? value : undefined
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

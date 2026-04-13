import {
  setGalleryCardSize,
  setGalleryShowFieldLabels
} from '@dataview/core/view'
import type { ViewApi } from '../../contracts/public'
import type { ViewBaseContext } from './base'

export const createGalleryApi = (
  base: ViewBaseContext
): ViewApi['gallery'] => ({
  setLabels: value => {
    base.withView(view => {
      base.commitPatch({
        options: setGalleryShowFieldLabels(view.options, value)
      })
    })
  },
  setCardSize: value => {
    base.withView(view => {
      base.commitPatch({
        options: setGalleryCardSize(view.options, value)
      })
    })
  },
  state: base.galleryState
})

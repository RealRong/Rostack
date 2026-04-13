import {
  setGalleryCardSize,
  setGalleryShowFieldLabels
} from '@dataview/core/view'
import type { ActiveViewApi } from '#engine/contracts/public'
import type { ActiveViewContext } from '#engine/active/context'

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
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

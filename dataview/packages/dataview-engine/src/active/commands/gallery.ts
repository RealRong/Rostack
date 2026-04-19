import {
  setGalleryCardSize,
  setGalleryCardLayout,
  setGalleryCardWrap
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setWrap: value => base.patch(view => ({
    options: setGalleryCardWrap(view.options, value)
  })),
  setSize: value => base.patch(view => ({
    options: setGalleryCardSize(view.options, value)
  })),
  setLayout: value => base.patch(view => ({
    options: setGalleryCardLayout(view.options, value)
  }))
})

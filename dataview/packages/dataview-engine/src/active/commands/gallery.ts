import {
  setGalleryCardSize,
  setGalleryShowFieldLabels
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { withViewPatch } from '@dataview/engine/active/commands/shared'

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setLabels: value => withViewPatch(base, view => ({
    options: setGalleryShowFieldLabels(view.options, value)
  })),
  setCardSize: value => withViewPatch(base, view => ({
    options: setGalleryCardSize(view.options, value)
  })),
  state: base.galleryState
})

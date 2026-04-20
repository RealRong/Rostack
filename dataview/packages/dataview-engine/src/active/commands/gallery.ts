import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setWrap: value => base.patch(view => ({
    options: viewApi.layout.gallery.setWrap(view.options, value)
  })),
  setSize: value => base.patch(view => ({
    options: viewApi.layout.gallery.setSize(view.options, value)
  })),
  setLayout: value => base.patch(view => ({
    options: viewApi.layout.gallery.setLayout(view.options, value)
  }))
})

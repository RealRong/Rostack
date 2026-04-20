import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setWrap: value => base.patch(view => ({
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        wrap: value
      }
    })
  })),
  setSize: value => base.patch(view => ({
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        size: value
      }
    })
  })),
  setLayout: value => base.patch(view => ({
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        layout: value
      }
    })
  }))
})

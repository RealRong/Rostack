import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createDisplayApi = (
  base: ActiveViewContext
): ActiveViewApi['display'] => ({
  replace: fieldIds => {
    base.patch(() => ({
      display: viewApi.display.replace(fieldIds)
    }))
  },
  move: (fieldIds, beforeFieldId) => {
    base.patch(view => ({
      display: viewApi.display.move(view.display, fieldIds, beforeFieldId)
    }))
  },
  show: (fieldId, beforeFieldId) => {
    base.patch(view => ({
      display: viewApi.display.show(view.display, fieldId, beforeFieldId)
    }))
  },
  hide: fieldId => {
    base.patch(view => ({
      display: viewApi.display.hide(view.display, fieldId)
    }))
  },
  clear: () => {
    base.patch(() => ({
      display: viewApi.display.clear()
    }))
  }
})

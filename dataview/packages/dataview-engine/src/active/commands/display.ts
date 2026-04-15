import {
  clearDisplayFields,
  hideDisplayField,
  moveDisplayFields,
  replaceDisplayFields,
  showDisplayField
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createDisplayApi = (
  base: ActiveViewContext
): ActiveViewApi['display'] => ({
  replace: fieldIds => {
    base.patch(() => ({
      display: replaceDisplayFields(fieldIds)
    }))
  },
  move: (fieldIds, beforeFieldId) => {
    base.patch(view => ({
      display: moveDisplayFields(view.display, fieldIds, beforeFieldId)
    }))
  },
  show: (fieldId, beforeFieldId) => {
    base.patch(view => ({
      display: showDisplayField(view.display, fieldId, beforeFieldId)
    }))
  },
  hide: fieldId => {
    base.patch(view => ({
      display: hideDisplayField(view.display, fieldId)
    }))
  },
  clear: () => {
    base.patch(() => ({
      display: clearDisplayFields()
    }))
  }
})

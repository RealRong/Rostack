import {
  clearDisplayFields,
  hideDisplayField,
  moveDisplayFields,
  replaceDisplayFields,
  showDisplayField
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { withViewPatch } from '@dataview/engine/active/commands/shared'

export const createDisplayApi = (
  base: ActiveViewContext
): ActiveViewApi['display'] => ({
  replace: fieldIds => {
    withViewPatch(base, () => ({
      display: replaceDisplayFields(fieldIds)
    }))
  },
  move: (fieldIds, beforeFieldId) => {
    withViewPatch(base, view => ({
      display: moveDisplayFields(view.display, fieldIds, beforeFieldId)
    }))
  },
  show: (fieldId, beforeFieldId) => {
    withViewPatch(base, view => ({
      display: showDisplayField(view.display, fieldId, beforeFieldId)
    }))
  },
  hide: fieldId => {
    withViewPatch(base, view => ({
      display: hideDisplayField(view.display, fieldId)
    }))
  },
  clear: () => {
    withViewPatch(base, () => ({
      display: clearDisplayFields()
    }))
  }
})

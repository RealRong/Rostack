import {
  clearDisplayFields,
  hideDisplayField,
  moveDisplayFields,
  replaceDisplayFields,
  showDisplayField
} from '@dataview/core/view'
import type { ViewApi } from '../../contracts/public'
import type { ViewBaseContext } from './base'

export const createDisplayApi = (
  base: ViewBaseContext
): ViewApi['display'] => ({
  replace: fieldIds => {
    base.withView(() => {
      base.commitPatch({
        display: replaceDisplayFields(fieldIds)
      })
    })
  },
  move: (fieldIds, beforeFieldId) => {
    base.withView(view => {
      base.commitPatch({
        display: moveDisplayFields(view.display, fieldIds, beforeFieldId)
      })
    })
  },
  show: (fieldId, beforeFieldId) => {
    base.withView(view => {
      base.commitPatch({
        display: showDisplayField(view.display, fieldId, beforeFieldId)
      })
    })
  },
  hide: fieldId => {
    base.withView(view => {
      base.commitPatch({
        display: hideDisplayField(view.display, fieldId)
      })
    })
  },
  clear: () => {
    base.withView(() => {
      base.commitPatch({
        display: clearDisplayFields()
      })
    })
  }
})

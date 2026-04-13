import {
  setGroupBucketCollapsed,
  setGroupBucketHidden,
  toggleGroupBucketCollapsed
} from '@dataview/core/group'
import type { ActiveViewApi } from '#engine/contracts/public'
import type { ActiveViewContext } from '#engine/active/context'

export const createSectionsApi = (
  base: ActiveViewContext
): ActiveViewApi['sections'] => ({
  show: key => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupBucketHidden(view.group, field, key, false) ?? null
      })
    })
  },
  hide: key => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupBucketHidden(view.group, field, key, true) ?? null
      })
    })
  },
  collapse: key => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupBucketCollapsed(view.group, field, key, true) ?? null
      })
    })
  },
  expand: key => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupBucketCollapsed(view.group, field, key, false) ?? null
      })
    })
  },
  toggleCollapse: key => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: toggleGroupBucketCollapsed(view.group, field, key) ?? null
      })
    })
  }
})

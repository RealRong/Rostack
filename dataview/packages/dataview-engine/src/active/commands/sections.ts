import {
  setGroupBucketCollapsed,
  setGroupBucketHidden,
  toggleGroupBucketCollapsed
} from '@dataview/core/group'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { withGroupFieldPatch } from '@dataview/engine/active/commands/shared'

export const createSectionsApi = (
  base: ActiveViewContext
): ActiveViewApi['sections'] => ({
  show: key => withGroupFieldPatch(base, (view, field) => ({
    group: setGroupBucketHidden(view.group, field, key, false) ?? null
  })),
  hide: key => withGroupFieldPatch(base, (view, field) => ({
    group: setGroupBucketHidden(view.group, field, key, true) ?? null
  })),
  collapse: key => withGroupFieldPatch(base, (view, field) => ({
    group: setGroupBucketCollapsed(view.group, field, key, true) ?? null
  })),
  expand: key => withGroupFieldPatch(base, (view, field) => ({
    group: setGroupBucketCollapsed(view.group, field, key, false) ?? null
  })),
  toggleCollapse: key => withGroupFieldPatch(base, (view, field) => ({
    group: toggleGroupBucketCollapsed(view.group, field, key) ?? null
  }))
})

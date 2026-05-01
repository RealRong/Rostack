import {
  cloneCardOptions,
  normalizeCardOptions
} from '@dataview/core/view/card'
import {
  viewCalcFields,
  viewDisplayFields,
  viewFilterFields,
  viewSearchFields,
  viewSortFields
} from '@dataview/core/view/demand'
import {
  createDuplicateViewInput
} from '@dataview/core/view/duplicate'
import {
  cloneGalleryOptions,
  normalizeGalleryOptions
} from '@dataview/core/view/gallery'
import {
  cloneKanbanOptions,
  normalizeKanbanOptions
} from '@dataview/core/view/kanban'
import {
  createDuplicateViewPreferredName,
  resolveUniqueViewName
} from '@dataview/core/view/naming'
import {
  normalizeViewOptions,
  type NormalizeViewOptionsContext
} from '@dataview/core/view/normalize'
import {
  applyRecordOrder,
  normalizeRecordOrderIds,
  spliceRecordIds,
  reorderRecordIds
} from '@dataview/core/view/order'
import {
  cloneTableOptions,
  createDefaultViewDisplay,
  createDefaultViewOptions,
  pruneFieldFromViewOptions
} from '@dataview/core/view/options'
import {
  getViewTypeSpec,
  viewTypeSpec
} from '@dataview/core/view/typeSpec'
import {
  repairViewForConvertedField,
  repairViewForRemovedField
} from '@dataview/core/view/repair'
import {
  cloneViewOptions,
  resolveDisplayInsertBeforeFieldId
} from '@dataview/core/view/shared'
import {
  clearDisplayFields,
  clearViewOrders,
  cloneDisplay,
  moveDisplayFields,
  hideDisplayField,
  normalizeViewDisplay,
  patchGalleryLayout,
  patchKanbanLayout,
  patchTableLayout,
  replaceDisplayFields,
  sameDisplay,
  sameViewOptions,
  showDisplayField
} from '@dataview/core/view/state'
import { active } from '@dataview/core/view/active'
import { filter } from '@dataview/core/view/filter'
import { sort } from '@dataview/core/view/sort'
import { search } from '@dataview/core/view/search'
import { group } from '@dataview/core/view/group'
import { calc } from '@dataview/core/view/calc'

export type { NormalizeViewOptionsContext }
export type * from '@dataview/core/view/filter'
export type * from '@dataview/core/view/group'
export type * from '@dataview/core/view/search'
export type * from '@dataview/core/view/sort'
export type * from '@dataview/core/view/calc'

export const view = {
  active,
  card: {
    clone: cloneCardOptions,
    normalize: normalizeCardOptions
  },
  demand: {
    search: viewSearchFields,
    filter: viewFilterFields,
    sort: viewSortFields,
    calc: viewCalcFields,
    display: viewDisplayFields
  },
  duplicate: {
    input: createDuplicateViewInput
  },
  display: {
    clone: cloneDisplay,
    same: sameDisplay,
    normalize: normalizeViewDisplay,
    replace: replaceDisplayFields,
    move: moveDisplayFields,
    show: showDisplayField,
    hide: hideDisplayField,
    clear: clearDisplayFields,
    insertBefore: resolveDisplayInsertBeforeFieldId
  },
  calc: {
    ...calc,
    clone: calc.view.clone,
    same: calc.view.same,
    set: calc.view.set
  },
  order: {
    normalize: normalizeRecordOrderIds,
    apply: applyRecordOrder,
    move: reorderRecordIds,
    splice: spliceRecordIds,
    clear: clearViewOrders
  },
  options: {
    clone: cloneViewOptions,
    same: sameViewOptions,
    normalize: normalizeViewOptions,
    defaults: createDefaultViewOptions,
    defaultDisplay: createDefaultViewDisplay,
    cloneTable: cloneTableOptions,
    pruneField: pruneFieldFromViewOptions
  },
  type: {
    spec: getViewTypeSpec
  },
  layout: {
    table: {
      patch: patchTableLayout
    },
    gallery: {
      clone: cloneGalleryOptions,
      normalize: normalizeGalleryOptions,
      patch: patchGalleryLayout
    },
    kanban: {
      clone: cloneKanbanOptions,
      normalize: normalizeKanbanOptions,
      patch: patchKanbanLayout
    }
  },
  name: {
    duplicate: createDuplicateViewPreferredName,
    unique: resolveUniqueViewName
  },
  repair: {
    field: {
      removed: repairViewForRemovedField,
      converted: repairViewForConvertedField
    }
  },
  filter,
  sort,
  search,
  group
} as const

export { active, filter, sort, search, group, calc as calculation }
export { viewTypeSpec, getViewTypeSpec }

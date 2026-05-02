import {
  cloneCardOptions,
  normalizeCardOptions
} from '@dataview/core/view/layout'
import {
  viewCalcFields,
  viewVisibleFields,
  viewFilterFields,
  viewSearchFields,
  viewSortFields
} from '@dataview/core/view/model/demand'
import {
  createDuplicateViewInput
} from '@dataview/core/view/model/duplicate'
import {
  cloneGalleryOptions,
  normalizeGalleryOptions
} from '@dataview/core/view/layout'
import {
  cloneKanbanOptions,
  normalizeKanbanOptions
} from '@dataview/core/view/layout'
import {
  createDuplicateViewPreferredName,
  resolveUniqueViewName
} from '@dataview/core/view/model/naming'
import {
  applyRecordOrder,
  clearViewOrder,
  normalizeRecordOrderIds,
  readViewOrderIds,
  replaceViewOrder,
  spliceRecordIds,
  reorderRecordIds
} from '@dataview/core/view/order'
import {
  cloneTableOptions,
  createDefaultViewFields,
  createDefaultViewOptions,
  cloneViewOptions,
  normalizeViewOptions,
  patchGalleryLayout,
  patchKanbanLayout,
  patchTableLayout,
  pruneFieldFromViewOptions,
  sameViewOptions,
  type NormalizeViewOptionsContext
} from '@dataview/core/view/options'
import {
  getViewTypeSpec,
  viewTypeSpec
} from '@dataview/core/view/model/typeSpec'
import {
  repairViewForConvertedField,
  repairViewForRemovedField
} from '@dataview/core/view/model/repair'
import {
  clearViewFields,
  cloneViewFields,
  hideViewField,
  moveViewFields,
  normalizeViewFields,
  readViewFieldIds,
  replaceViewFields,
  resolveFieldInsertBeforeFieldId,
  sameViewFields,
  showViewField
} from '@dataview/core/view/fields'
import { active } from '@dataview/core/view/model/active'
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
    fields: viewVisibleFields
  },
  duplicate: {
    input: createDuplicateViewInput
  },
  fields: {
    read: {
      ids: readViewFieldIds
    },
    clone: cloneViewFields,
    same: sameViewFields,
    normalize: normalizeViewFields,
    replace: replaceViewFields,
    move: moveViewFields,
    show: showViewField,
    hide: hideViewField,
    clear: clearViewFields,
    insertBefore: resolveFieldInsertBeforeFieldId
  },
  calc: {
    ...calc,
    clone: calc.view.clone,
    same: calc.view.same,
    set: calc.view.set
  },
  order: {
    read: {
      ids: readViewOrderIds
    },
    normalize: normalizeRecordOrderIds,
    apply: applyRecordOrder,
    replace: replaceViewOrder,
    move: reorderRecordIds,
    splice: spliceRecordIds,
    clear: clearViewOrder
  },
  options: {
    clone: cloneViewOptions,
    same: sameViewOptions,
    normalize: normalizeViewOptions,
    defaults: createDefaultViewOptions,
    defaultFields: createDefaultViewFields,
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

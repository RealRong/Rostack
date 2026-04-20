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
  reorderRecordBlockIds,
  reorderRecordIds
} from '@dataview/core/view/order'
import {
  cloneTableOptions,
  createDefaultViewDisplay,
  createDefaultViewOptions,
  pruneFieldFromViewOptions
} from '@dataview/core/view/options'
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
  cloneViewCalc,
  moveDisplayFields,
  hideDisplayField,
  normalizeViewDisplay,
  patchGalleryLayout,
  patchKanbanLayout,
  patchTableLayout,
  replaceDisplayFields,
  reorderViewOrders,
  sameDisplay,
  sameViewCalc,
  sameViewOptions,
  setViewCalcMetric,
  showDisplayField
} from '@dataview/core/view/state'

export type { NormalizeViewOptionsContext }

export const view = {
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
    clone: cloneViewCalc,
    same: sameViewCalc,
    set: setViewCalcMetric
  },
  order: {
    normalize: normalizeRecordOrderIds,
    apply: applyRecordOrder,
    move: reorderRecordIds,
    moveBlock: reorderRecordBlockIds,
    reorder: reorderViewOrders,
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
  }
} as const

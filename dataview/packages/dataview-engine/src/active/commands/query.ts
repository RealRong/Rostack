import {
  addFilterRule,
  cloneFilter,
  removeFilterRule,
  replaceFilterRule,
  setFilterMode,
  setFilterPreset,
  setFilterValue
} from '@dataview/core/filter'
import {
  clearGroup,
  setGroup,
  setGroupBucketInterval,
  setGroupBucketSort,
  setGroupMode,
  setGroupShowEmpty,
  toggleGroup
} from '@dataview/core/group'
import { setSearchQuery } from '@dataview/core/search'
import {
  addSorter,
  clearSorters,
  moveSorter,
  removeSorter,
  replaceSorter,
  setOnlySorter,
  setSorter
} from '@dataview/core/sort'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import {
  withFieldPatch,
  withFilterFieldPatch,
  withGroupFieldPatch,
  withViewPatch
} from '@dataview/engine/active/commands/shared'

export const createSearchApi = (
  base: ActiveViewContext
): ActiveViewApi['search'] => ({
  set: value => {
    withViewPatch(base, view => ({
      search: setSearchQuery(view.search, value)
    }))
  }
})

export const createFiltersApi = (
  base: ActiveViewContext
): ActiveViewApi['filters'] => ({
  add: fieldId => {
    withFieldPatch(base, fieldId, (view, field) => ({
      filter: addFilterRule(view.filter, field)
    }))
  },
  update: (index, rule) => {
    withViewPatch(base, view => ({
      filter: replaceFilterRule(view.filter, index, rule)
    }))
  },
  setPreset: (index, presetId) => {
    withFilterFieldPatch(base, index, (view, field) => ({
      filter: setFilterPreset(view.filter, index, field, presetId)
    }))
  },
  setValue: (index, value) => {
    withFilterFieldPatch(base, index, (view, field) => ({
      filter: setFilterValue(view.filter, index, field, value)
    }))
  },
  setMode: value => {
    withViewPatch(base, view => ({
      filter: setFilterMode(view.filter, value)
    }))
  },
  remove: index => {
    withViewPatch(base, view => ({
      filter: removeFilterRule(view.filter, index)
    }))
  },
  clear: () => {
    withViewPatch(base, view => ({
      filter: cloneFilter({
        ...view.filter,
        rules: []
      })
    }))
  }
})

export const createSortApi = (
  base: ActiveViewContext
): ActiveViewApi['sort'] => ({
  add: (fieldId, direction) => {
    withViewPatch(base, view => ({
      sort: addSorter(view.sort, fieldId, direction)
    }))
  },
  update: (fieldId, direction) => {
    withViewPatch(base, view => ({
      sort: setSorter(view.sort, fieldId, direction)
    }))
  },
  keepOnly: (fieldId, direction) => {
    withViewPatch(base, view => ({
      sort: setOnlySorter(view.sort, fieldId, direction)
    }))
  },
  replace: (index, sorter) => {
    withViewPatch(base, view => ({
      sort: replaceSorter(view.sort, index, sorter)
    }))
  },
  remove: index => {
    withViewPatch(base, view => ({
      sort: removeSorter(view.sort, index)
    }))
  },
  move: (from, to) => {
    withViewPatch(base, view => ({
      sort: moveSorter(view.sort, from, to)
    }))
  },
  clear: () => {
    withViewPatch(base, view => ({
      sort: clearSorters(view.sort)
    }))
  }
})

export const createGroupApi = (
  base: ActiveViewContext
): ActiveViewApi['group'] => ({
  set: fieldId => {
    withFieldPatch(base, fieldId, (view, field) => ({
      group: setGroup(view.group, field) ?? null
    }))
  },
  clear: () => {
    withViewPatch(base, view => ({
      group: clearGroup(view.group) ?? null
    }))
  },
  toggle: fieldId => {
    withFieldPatch(base, fieldId, (view, field) => ({
      group: toggleGroup(view.group, field) ?? null
    }))
  },
  setMode: value => {
    withGroupFieldPatch(base, (view, field) => ({
      group: setGroupMode(view.group, field, value) ?? null
    }))
  },
  setSort: value => {
    withGroupFieldPatch(base, (view, field) => ({
      group: setGroupBucketSort(view.group, field, value) ?? null
    }))
  },
  setInterval: value => {
    withGroupFieldPatch(base, (view, field) => ({
      group: setGroupBucketInterval(view.group, field, value) ?? null
    }))
  },
  setShowEmpty: value => {
    withGroupFieldPatch(base, (view, field) => ({
      group: setGroupShowEmpty(view.group, field, value) ?? null
    }))
  }
})

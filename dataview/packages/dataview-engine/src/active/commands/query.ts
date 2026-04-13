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
import type { ActiveViewApi } from '#engine/contracts/public.ts'
import type { ActiveViewContext } from '#engine/active/context.ts'

export const createSearchApi = (
  base: ActiveViewContext
): ActiveViewApi['search'] => ({
  set: value => {
    base.withView(view => {
      base.commitPatch({
        search: setSearchQuery(view.search, value)
      })
    })
  }
})

export const createFiltersApi = (
  base: ActiveViewContext
): ActiveViewApi['filters'] => ({
  add: fieldId => {
    base.withField(fieldId, (view, field) => {
      base.commitPatch({
        filter: addFilterRule(view.filter, field)
      })
    })
  },
  update: (index, rule) => {
    base.withView(view => {
      base.commitPatch({
        filter: replaceFilterRule(view.filter, index, rule)
      })
    })
  },
  setPreset: (index, presetId) => {
    base.withFilterField(index, (view, field) => {
      base.commitPatch({
        filter: setFilterPreset(view.filter, index, field, presetId)
      })
    })
  },
  setValue: (index, value) => {
    base.withFilterField(index, (view, field) => {
      base.commitPatch({
        filter: setFilterValue(view.filter, index, field, value)
      })
    })
  },
  setMode: value => {
    base.withView(view => {
      base.commitPatch({
        filter: setFilterMode(view.filter, value)
      })
    })
  },
  remove: index => {
    base.withView(view => {
      base.commitPatch({
        filter: removeFilterRule(view.filter, index)
      })
    })
  },
  clear: () => {
    base.withView(view => {
      base.commitPatch({
        filter: cloneFilter({
          ...view.filter,
          rules: []
        })
      })
    })
  }
})

export const createSortApi = (
  base: ActiveViewContext
): ActiveViewApi['sort'] => ({
  add: (fieldId, direction) => {
    base.withView(view => {
      base.commitPatch({
        sort: addSorter(view.sort, fieldId, direction)
      })
    })
  },
  update: (fieldId, direction) => {
    base.withView(view => {
      base.commitPatch({
        sort: setSorter(view.sort, fieldId, direction)
      })
    })
  },
  keepOnly: (fieldId, direction) => {
    base.withView(view => {
      base.commitPatch({
        sort: setOnlySorter(view.sort, fieldId, direction)
      })
    })
  },
  replace: (index, sorter) => {
    base.withView(view => {
      base.commitPatch({
        sort: replaceSorter(view.sort, index, sorter)
      })
    })
  },
  remove: index => {
    base.withView(view => {
      base.commitPatch({
        sort: removeSorter(view.sort, index)
      })
    })
  },
  move: (from, to) => {
    base.withView(view => {
      base.commitPatch({
        sort: moveSorter(view.sort, from, to)
      })
    })
  },
  clear: () => {
    base.withView(view => {
      base.commitPatch({
        sort: clearSorters(view.sort)
      })
    })
  }
})

export const createGroupApi = (
  base: ActiveViewContext
): ActiveViewApi['group'] => ({
  set: fieldId => {
    base.withField(fieldId, (view, field) => {
      base.commitPatch({
        group: setGroup(view.group, field) ?? null
      })
    })
  },
  clear: () => {
    base.withView(view => {
      base.commitPatch({
        group: clearGroup(view.group) ?? null
      })
    })
  },
  toggle: fieldId => {
    base.withField(fieldId, (view, field) => {
      base.commitPatch({
        group: toggleGroup(view.group, field) ?? null
      })
    })
  },
  setMode: value => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupMode(view.group, field, value) ?? null
      })
    })
  },
  setSort: value => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupBucketSort(view.group, field, value) ?? null
      })
    })
  },
  setInterval: value => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupBucketInterval(view.group, field, value) ?? null
      })
    })
  },
  setShowEmpty: value => {
    base.withGroupField((view, field) => {
      base.commitPatch({
        group: setGroupShowEmpty(view.group, field, value) ?? null
      })
    })
  }
})

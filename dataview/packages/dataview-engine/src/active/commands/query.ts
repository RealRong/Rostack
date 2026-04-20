import {
  filter
} from '@dataview/core/filter'
import {
  group
} from '@dataview/core/group'
import { search } from '@dataview/core/search'
import {
  sort
} from '@dataview/core/sort'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createSearchApi = (
  base: ActiveViewContext
): ActiveViewApi['search'] => ({
  set: value => {
    base.patch(view => ({
      search: search.state.setQuery(view.search, value)
    }))
  }
})

export const createFiltersApi = (
  base: ActiveViewContext
): ActiveViewApi['filters'] => ({
  add: fieldId => {
    base.patch((view, reader) => {
      const field = reader.fields.get(fieldId)
      return field
        ? {
            filter: filter.write.add(view.filter, field)
          }
        : undefined
    })
  },
  update: (index, rule) => {
    base.patch(view => ({
      filter: filter.write.replace(view.filter, index, rule)
    }))
  },
  setPreset: (index, presetId) => {
    base.patch((view, reader) => {
      const fieldId = view.filter.rules[index]?.fieldId
      return {
        filter: filter.write.preset(
          view.filter,
          index,
          fieldId
            ? reader.fields.get(fieldId)
            : undefined,
          presetId
        )
      }
    })
  },
  setValue: (index, value) => {
    base.patch((view, reader) => {
      const fieldId = view.filter.rules[index]?.fieldId
      return {
        filter: filter.write.value(
          view.filter,
          index,
          fieldId
            ? reader.fields.get(fieldId)
            : undefined,
          value
        )
      }
    })
  },
  setMode: value => {
    base.patch(view => ({
      filter: filter.write.mode(view.filter, value)
    }))
  },
  remove: index => {
    base.patch(view => ({
      filter: filter.write.remove(view.filter, index)
    }))
  },
  clear: () => {
    base.patch(view => ({
      filter: filter.write.clear(view.filter)
    }))
  }
})

export const createSortApi = (
  base: ActiveViewContext
): ActiveViewApi['sort'] => ({
  add: (fieldId, direction) => {
    base.patch(view => ({
      sort: sort.write.add(view.sort, fieldId, direction)
    }))
  },
  update: (fieldId, direction) => {
    base.patch(view => ({
      sort: sort.write.upsert(view.sort, fieldId, direction)
    }))
  },
  keepOnly: (fieldId, direction) => {
    base.patch(view => ({
      sort: sort.write.keepOnly(view.sort, fieldId, direction)
    }))
  },
  replace: (index, sorter) => {
    base.patch(view => ({
      sort: sort.write.replace(view.sort, index, sorter)
    }))
  },
  remove: index => {
    base.patch(view => ({
      sort: sort.write.remove(view.sort, index)
    }))
  },
  move: (from, to) => {
    base.patch(view => ({
      sort: sort.write.move(view.sort, from, to)
    }))
  },
  clear: () => {
    base.patch(view => ({
      sort: sort.write.clear(view.sort)
    }))
  }
})

export const createGroupApi = (
  base: ActiveViewContext
): ActiveViewApi['group'] => ({
  set: fieldId => {
    base.patch((view, reader) => {
      const field = reader.fields.get(fieldId)
      return field
        ? {
            group: group.set(view.group, field) ?? null
          }
        : undefined
    })
  },
  clear: () => {
    base.patch(view => ({
      group: group.clear(view.group) ?? null
    }))
  },
  toggle: fieldId => {
    base.patch((view, reader) => {
      const field = reader.fields.get(fieldId)
      return field
        ? {
            group: group.toggle(view.group, field) ?? null
          }
        : undefined
    })
  },
  setMode: value => {
    base.patch((view, reader) => {
      const fieldId = view.group?.field
      const field = fieldId
        ? reader.fields.get(fieldId)
        : undefined
      return field
        ? {
            group: group.patch(view.group, field, {
              mode: value
            }) ?? null
          }
        : undefined
    })
  },
  setSort: value => {
    base.patch((view, reader) => {
      const fieldId = view.group?.field
      const field = fieldId
        ? reader.fields.get(fieldId)
        : undefined
      return field
        ? {
            group: group.patch(view.group, field, {
              bucketSort: value
            }) ?? null
          }
        : undefined
    })
  },
  setInterval: value => {
    base.patch((view, reader) => {
      const fieldId = view.group?.field
      const field = fieldId
        ? reader.fields.get(fieldId)
        : undefined
      return field
        ? {
            group: group.patch(view.group, field, {
              bucketInterval: value
            }) ?? null
          }
        : undefined
    })
  },
  setShowEmpty: value => {
    base.patch((view, reader) => {
      const fieldId = view.group?.field
      const field = fieldId
        ? reader.fields.get(fieldId)
        : undefined
      return field
        ? {
            group: group.patch(view.group, field, {
              showEmpty: value
            }) ?? null
          }
        : undefined
    })
  }
})

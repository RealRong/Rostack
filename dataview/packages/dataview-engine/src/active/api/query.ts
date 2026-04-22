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
import type { ActiveViewContext } from '@dataview/engine/active/api/context'

export const createSearchApi = (
  base: ActiveViewContext
): ActiveViewApi['search'] => ({
  set: value => {
    base.patchView(view => ({
      search: search.state.setQuery(view.search, value)
    }))
  }
})

export const createFiltersApi = (
  base: ActiveViewContext
): ActiveViewApi['filters'] => ({
  add: fieldId => {
    base.patchView((view, reader) => {
      const field = reader.fields.get(fieldId)
      return field
        ? {
            filter: filter.write.add(view.filter, field)
          }
        : undefined
    })
  },
  update: (index, rule) => {
    base.patchView(view => ({
      filter: filter.write.replace(view.filter, index, rule)
    }))
  },
  setPreset: (index, presetId) => {
    base.patchView((view, reader) => {
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
    base.patchView((view, reader) => {
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
    base.patchView(view => ({
      filter: filter.write.mode(view.filter, value)
    }))
  },
  remove: index => {
    base.patchView(view => ({
      filter: filter.write.remove(view.filter, index)
    }))
  },
  clear: () => {
    base.patchView(view => ({
      filter: filter.write.clear(view.filter)
    }))
  }
})

export const createSortApi = (
  base: ActiveViewContext
): ActiveViewApi['sort'] => ({
  add: (fieldId, direction) => {
    base.patchView(view => ({
      sort: sort.write.add(view.sort, fieldId, direction)
    }))
  },
  update: (fieldId, direction) => {
    base.patchView(view => ({
      sort: sort.write.upsert(view.sort, fieldId, direction)
    }))
  },
  keepOnly: (fieldId, direction) => {
    base.patchView(view => ({
      sort: sort.write.keepOnly(view.sort, fieldId, direction)
    }))
  },
  replace: (index, sorter) => {
    base.patchView(view => ({
      sort: sort.write.replace(view.sort, index, sorter)
    }))
  },
  remove: index => {
    base.patchView(view => ({
      sort: sort.write.remove(view.sort, index)
    }))
  },
  move: (from, to) => {
    base.patchView(view => ({
      sort: sort.write.move(view.sort, from, to)
    }))
  },
  clear: () => {
    base.patchView(view => ({
      sort: sort.write.clear(view.sort)
    }))
  }
})

export const createGroupApi = (
  base: ActiveViewContext
): ActiveViewApi['group'] => ({
  set: fieldId => {
    base.patchView((view, reader) => {
      const field = reader.fields.get(fieldId)
      return field
        ? {
            group: group.set(view.group, field) ?? null
          }
        : undefined
    })
  },
  clear: () => {
    base.patchView(view => ({
      group: group.clear(view.group) ?? null
    }))
  },
  toggle: fieldId => {
    base.patchView((view, reader) => {
      const field = reader.fields.get(fieldId)
      return field
        ? {
            group: group.toggle(view.group, field) ?? null
          }
        : undefined
    })
  },
  setMode: value => {
    base.patchView(view => {
      const field = base.resolveGroupField(view)
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
    base.patchView(view => {
      const field = base.resolveGroupField(view)
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
    base.patchView(view => {
      const field = base.resolveGroupField(view)
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
    base.patchView(view => {
      const field = base.resolveGroupField(view)
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

export const createSectionsApi = (
  base: ActiveViewContext
): ActiveViewApi['sections'] => ({
  show: key => base.patchView(view => {
    const field = base.resolveGroupField(view)
    return field
      ? {
          group: group.bucket.patch(view.group, field, key, {
            hidden: false
          }) ?? null
        }
      : undefined
  }),
  hide: key => base.patchView(view => {
    const field = base.resolveGroupField(view)
    return field
      ? {
          group: group.bucket.patch(view.group, field, key, {
            hidden: true
          }) ?? null
        }
      : undefined
  }),
  collapse: key => base.patchView(view => {
    const field = base.resolveGroupField(view)
    return field
      ? {
          group: group.bucket.patch(view.group, field, key, {
            collapsed: true
          }) ?? null
        }
      : undefined
  }),
  expand: key => base.patchView(view => {
    const field = base.resolveGroupField(view)
    return field
      ? {
          group: group.bucket.patch(view.group, field, key, {
            collapsed: false
          }) ?? null
        }
      : undefined
  }),
  toggleCollapse: key => base.patchView(view => {
    const field = base.resolveGroupField(view)
    return field
      ? {
          group: group.bucket.toggleCollapsed(view.group, field, key) ?? null
        }
      : undefined
  })
})

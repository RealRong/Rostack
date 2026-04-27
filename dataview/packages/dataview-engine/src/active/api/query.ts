import {
  filter
} from '@dataview/core/view'
import {
  group
} from '@dataview/core/view'
import { search } from '@dataview/core/view'
import {
  sort
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/view'
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
  create: fieldId => {
    let createdId
    const applied = base.patchView((view, reader) => {
      const field = reader.fields.get(fieldId)
      if (!field) {
        return undefined
      }

      const created = filter.write.create(view.filter, field)
      createdId = created.id
      return {
        filter: created.filter
      }
    })
    if (!applied || !createdId) {
      throw new Error(`Unable to create filter for field ${fieldId}`)
    }
    return createdId
  },
  patch: (id, patch) => {
    base.patchView((view, reader) => {
      const nextFieldId = patch.fieldId ?? filter.rules.get(view.filter.rules, id)?.fieldId
      if (patch.fieldId !== undefined && !reader.fields.has(patch.fieldId)) {
        return undefined
      }

      return {
        filter: filter.write.patch(
          view.filter,
          id,
          patch,
          nextFieldId
            ? reader.fields.get(nextFieldId)
            : undefined
        )
      }
    })
  },
  setMode: value => {
    base.patchView(view => ({
      filter: filter.write.mode(view.filter, value)
    }))
  },
  remove: id => {
    base.patchView(view => ({
      filter: filter.write.remove(view.filter, id)
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
  create: (fieldId, direction) => {
    let createdId
    const applied = base.patchView(view => {
      const created = sort.write.create(view.sort, fieldId, direction)
      createdId = created.id
      return {
        sort: created.sort
      }
    })
    if (!applied || !createdId) {
      throw new Error(`Unable to create sort for field ${fieldId}`)
    }
    return createdId
  },
  patch: (id, patch) => {
    base.patchView(view => ({
      sort: sort.write.patch(view.sort, id, patch)
    }))
  },
  move: (id, beforeId) => {
    base.patchView(view => ({
      sort: sort.write.move(view.sort, id, beforeId.before)
    }))
  },
  remove: id => {
    base.patchView(view => ({
      sort: sort.write.remove(view.sort, id)
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

import {
  group,
  search
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/view'
import type { ActiveViewContext } from '@dataview/engine/active/api/context'

const readCreatedId = (
  value: unknown
): string | undefined => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'string'
)
  ? value.id
  : undefined

export const createSearchApi = (
  base: ActiveViewContext
): ActiveViewApi['search'] => ({
  set: (value) => {
    const view = base.view()
    if (!view) {
      return
    }

    base.execute({
      type: 'view.search.set',
      id: view.id,
      search: search.state.setQuery(view.search, value)
    })
  }
})

export const createFiltersApi = (
  base: ActiveViewContext
): ActiveViewApi['filters'] => ({
  create: (fieldId) => {
    const viewId = base.id()
    if (!viewId) {
      throw new Error(`Unable to create filter for field ${fieldId}`)
    }

    const result = base.execute({
      type: 'view.filter.create',
      id: viewId,
      input: {
        fieldId
      }
    })
    const createdId = result.ok
      ? readCreatedId(result.data)
      : undefined
    if (!createdId) {
      throw new Error(`Unable to create filter for field ${fieldId}`)
    }
    return createdId
  },
  patch: (id, patch) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.filter.patch',
      id: viewId,
      rule: id,
      patch
    })
  },
  setMode: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.filter.mode.set',
      id: viewId,
      mode: value
    })
  },
  remove: (id) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.filter.remove',
      id: viewId,
      rule: id
    })
  },
  clear: () => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.filter.clear',
      id: viewId
    })
  }
})

export const createSortApi = (
  base: ActiveViewContext
): ActiveViewApi['sort'] => ({
  create: (fieldId, direction) => {
    const viewId = base.id()
    if (!viewId) {
      throw new Error(`Unable to create sort for field ${fieldId}`)
    }

    const result = base.execute({
      type: 'view.sort.create',
      id: viewId,
      input: {
        fieldId,
        ...(direction !== undefined
          ? { direction }
          : {})
      }
    })
    const createdId = result.ok
      ? readCreatedId(result.data)
      : undefined
    if (!createdId) {
      throw new Error(`Unable to create sort for field ${fieldId}`)
    }
    return createdId
  },
  patch: (id, patch) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.sort.patch',
      id: viewId,
      rule: id,
      patch
    })
  },
  move: (id, target) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.sort.move',
      id: viewId,
      rule: id,
      ...(target.before !== undefined && target.before !== null
        ? { before: target.before }
        : {})
    })
  },
  remove: (id) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.sort.remove',
      id: viewId,
      rule: id
    })
  },
  clear: () => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.sort.clear',
      id: viewId
    })
  }
})

export const createGroupApi = (
  base: ActiveViewContext
): ActiveViewApi['group'] => ({
  set: (fieldId) => {
    const view = base.view()
    const field = base.query().fields.get(fieldId)
    if (!view || !field) {
      return
    }

    const nextGroup = group.write.set(view.group, field)
    if (!nextGroup) {
      return
    }

    base.execute({
      type: 'view.group.set',
      id: view.id,
      group: nextGroup
    })
  },
  clear: () => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.group.clear',
      id: viewId
    })
  },
  toggle: (fieldId) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.group.toggle',
      id: viewId,
      field: fieldId
    })
  },
  setMode: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.group.mode.set',
      id: viewId,
      mode: value
    })
  },
  setSort: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.group.sort.set',
      id: viewId,
      sort: value
    })
  },
  setInterval: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.group.interval.set',
      id: viewId,
      ...(value !== undefined
        ? { interval: value }
        : {})
    })
  },
  setShowEmpty: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.group.showEmpty.set',
      id: viewId,
      value
    })
  }
})

export const createSectionsApi = (
  base: ActiveViewContext
): ActiveViewApi['sections'] => ({
  show: (key) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.section.show',
      id: viewId,
      bucket: key
    })
  },
  hide: (key) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.section.hide',
      id: viewId,
      bucket: key
    })
  },
  collapse: (key) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.section.collapse',
      id: viewId,
      bucket: key
    })
  },
  expand: (key) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.section.expand',
      id: viewId,
      bucket: key
    })
  },
  toggleCollapse: (key) => {
    const view = base.view()
    if (!view?.group) {
      return
    }

    const collapsed = view.group.buckets?.[key]?.collapsed === true
    base.execute({
      type: collapsed
        ? 'view.section.expand'
        : 'view.section.collapse',
      id: view.id,
      bucket: key
    })
  }
})

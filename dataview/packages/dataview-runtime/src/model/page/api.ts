import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  createDerivedStore,
  read,
  sameIdOrder,
  type ReadStore
} from '@shared/core'
import {
  getAvailableFilterFields,
  getAvailableSorterFields
} from '@dataview/runtime/model/queryFields'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  PageBody,
  PageHeader,
  PageModel,
  PageQuery,
  PageSettings,
  PageToolbar
} from '@dataview/runtime/model/page/types'
import type {
  PageState
} from '@dataview/runtime/page/session/types'

const sameRoute = (
  left: PageQuery['route'],
  right: PageQuery['route']
) => {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }

  return left.kind === right.kind
    && (left.kind !== 'filter' || right.kind !== 'filter' || left.index === right.index)
}

const sameQueryBar = (
  left: PageToolbar['queryBar'],
  right: PageToolbar['queryBar']
) => left.visible === right.visible
  && sameRoute(left.route, right.route)

const sameBody = (
  left: PageBody,
  right: PageBody
) => left.viewType === right.viewType
  && left.empty === right.empty

const sameHeader = (
  left: PageHeader,
  right: PageHeader
) => left.viewId === right.viewId
  && left.viewType === right.viewType
  && left.viewName === right.viewName

const sameToolbar = (
  left: PageToolbar,
  right: PageToolbar
) => left.currentView === right.currentView
  && left.activeViewId === right.activeViewId
  && sameQueryBar(left.queryBar, right.queryBar)
  && left.search === right.search
  && left.filterCount === right.filterCount
  && left.sortCount === right.sortCount
  && sameIdOrder(left.views, right.views)
  && sameIdOrder(left.availableFilterFields, right.availableFilterFields)
  && sameIdOrder(left.availableSortFields, right.availableSortFields)

const sameQuery = (
  left: PageQuery,
  right: PageQuery
) => left.visible === right.visible
  && sameRoute(left.route, right.route)
  && left.currentView === right.currentView
  && left.filters === right.filters
  && left.sorts === right.sorts
  && sameIdOrder(left.availableFilterFields, right.availableFilterFields)
  && sameIdOrder(left.availableSortFields, right.availableSortFields)

const sameSettings = (
  left: PageSettings,
  right: PageSettings
) => left.viewsCount === right.viewsCount
  && left.currentView === right.currentView
  && left.filter === right.filter
  && left.sort === right.sort
  && left.group === right.group
  && sameIdOrder(left.fields, right.fields)

const createListStore = <TId, T extends { id: unknown }>(input: {
  ids: ReadStore<readonly TId[]>
  values: {
    get: (id: TId) => T | undefined
  }
}) => createDerivedStore<readonly T[]>({
  get: () => read(input.ids)
    .flatMap(id => {
      const value = input.values.get(id)
      return value ? [value] : []
    }),
  isEqual: sameIdOrder
})

const createAvailableFields = (input: {
  source: DataViewSource
  resolveUsedFieldIds: () => readonly FieldId[]
  resolveAvailable: (fields: readonly Field[], usedFieldIds: readonly FieldId[]) => readonly Field[]
}) => createDerivedStore<readonly Field[]>({
  get: () => input.resolveAvailable(
    read(createListStore({
      ids: input.source.doc.fields.ids,
      values: input.source.doc.fields
    })),
    input.resolveUsedFieldIds()
  ),
  isEqual: sameIdOrder
})

export const createPageModel = (input: {
  source: DataViewSource
  pageStateStore: ReadStore<PageState>
}): PageModel => {
  const fields = createListStore({
    ids: input.source.doc.fields.ids,
    values: input.source.doc.fields
  })
  const views = createListStore({
    ids: input.source.doc.views.ids,
    values: input.source.doc.views
  })
  const availableFilterFields = createDerivedStore<readonly Field[]>({
    get: () => getAvailableFilterFields(
      read(fields),
      read(input.source.active.query.filters).rules.map(entry => entry.rule)
    ),
    isEqual: sameIdOrder
  })
  const availableSortFields = createDerivedStore<readonly Field[]>({
    get: () => getAvailableSorterFields(
      read(fields),
      read(input.source.active.query.sort).rules.map(entry => entry.sorter)
    ),
    isEqual: sameIdOrder
  })

  const body = createDerivedStore<PageBody>({
    get: () => ({
      viewType: read(input.source.active.view.type),
      empty: read(input.source.active.items.ids).length === 0
    }),
    isEqual: sameBody
  })

  const header = createDerivedStore<PageHeader>({
    get: () => {
      const currentView = read(input.source.active.view.current)
      return {
        viewId: read(input.source.active.view.id),
        viewType: currentView?.type,
        viewName: currentView?.name
      }
    },
    isEqual: sameHeader
  })

  const toolbar = createDerivedStore<PageToolbar>({
    get: () => {
      const currentView = read(input.source.active.view.current)
      const pageState = read(input.pageStateStore)
      const filters = read(input.source.active.query.filters).rules
      const sorts = read(input.source.active.query.sort).rules

      return {
        views: read(views),
        currentView,
        activeViewId: read(input.source.active.view.id),
        queryBar: pageState.query,
        search: read(input.source.active.query.search).query,
        filterCount: filters.length,
        sortCount: sorts.length,
        availableFilterFields: read(availableFilterFields),
        availableSortFields: read(availableSortFields)
      }
    },
    isEqual: sameToolbar
  })

  const query = createDerivedStore<PageQuery>({
    get: () => {
      const pageState = read(input.pageStateStore)
      return {
        visible: pageState.query.visible,
        route: pageState.query.route,
        currentView: read(input.source.active.view.current),
        filters: read(input.source.active.query.filters).rules,
        sorts: read(input.source.active.query.sort).rules,
        availableFilterFields: read(availableFilterFields),
        availableSortFields: read(availableSortFields)
      }
    },
    isEqual: sameQuery
  })

  const settings = createDerivedStore<PageSettings>({
    get: () => ({
      viewsCount: read(input.source.doc.views.ids).length,
      fields: read(fields),
      currentView: read(input.source.active.view.current),
      filter: read(input.source.active.query.filters),
      sort: read(input.source.active.query.sort),
      group: read(input.source.active.query.group)
    }),
    isEqual: sameSettings
  })

  return {
    body,
    header,
    toolbar,
    query,
    settings
  }
}

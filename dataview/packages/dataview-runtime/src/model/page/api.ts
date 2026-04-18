import {
  getDocumentFields,
  getDocumentViews
} from '@dataview/core/document'
import type {
  DataDoc,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine'
import type {
  PageState
} from '@dataview/runtime/page/session/types'
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
  DataViewPageBody,
  DataViewPageHeader,
  DataViewPageQueryBar,
  DataViewPageRuntime,
  DataViewPageSettings,
  DataViewPageToolbar
} from '@dataview/runtime/model/page/types'

const sameRoute = (
  left: DataViewPageQueryBar['route'],
  right: DataViewPageQueryBar['route']
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
  left: DataViewPageToolbar['queryBar'],
  right: DataViewPageToolbar['queryBar']
) => left.visible === right.visible
  && sameRoute(left.route, right.route)

const sameHeader = (
  left: DataViewPageHeader,
  right: DataViewPageHeader
) => left.viewId === right.viewId
  && left.viewType === right.viewType
  && left.viewName === right.viewName

const sameBody = (
  left: DataViewPageBody,
  right: DataViewPageBody
) => left.viewType === right.viewType
  && left.empty === right.empty

const sameToolbar = (
  left: DataViewPageToolbar,
  right: DataViewPageToolbar
) => left.currentView === right.currentView
  && left.activeViewId === right.activeViewId
  && sameQueryBar(left.queryBar, right.queryBar)
  && left.search === right.search
  && left.filterCount === right.filterCount
  && left.sortCount === right.sortCount
  && sameIdOrder(left.views, right.views)
  && sameIdOrder(left.availableFilterFields, right.availableFilterFields)
  && sameIdOrder(left.availableSortFields, right.availableSortFields)

const sameQueryBarView = (
  left: DataViewPageQueryBar,
  right: DataViewPageQueryBar
) => left.visible === right.visible
  && sameRoute(left.route, right.route)
  && left.currentView === right.currentView
  && left.filters === right.filters
  && left.sorts === right.sorts
  && sameIdOrder(left.availableFilterFields, right.availableFilterFields)
  && sameIdOrder(left.availableSortFields, right.availableSortFields)

const sameSettings = (
  left: DataViewPageSettings,
  right: DataViewPageSettings
) => left.viewsCount === right.viewsCount
  && left.currentView === right.currentView
  && left.filter === right.filter
  && left.sort === right.sort
  && left.group === right.group
  && sameIdOrder(left.fields, right.fields)

const createDocumentFieldsStore = (
  document: ReadStore<DataDoc>
) => createDerivedStore({
  get: () => getDocumentFields(read(document)),
  isEqual: (left, right) => sameIdOrder(left, right)
})

const createDocumentViewsStore = (
  document: ReadStore<DataDoc>
) => createDerivedStore<readonly View[]>({
  get: () => getDocumentViews(read(document)),
  isEqual: (left, right) => sameIdOrder(left, right)
})

const createPageBodyStore = (input: {
  currentViewStore: ReadStore<View | undefined>
  activeStateStore: ReadStore<ViewState | undefined>
}) => createDerivedStore<DataViewPageBody>({
  get: () => {
    const currentView = read(input.currentViewStore)
    const activeState = read(input.activeStateStore)
    return {
      viewType: currentView?.type,
      empty: !activeState || activeState.items.count === 0
    }
  },
  isEqual: sameBody
})

const createPageHeaderStore = (input: {
  activeViewIdStore: ReadStore<ViewId | undefined>
  currentViewStore: ReadStore<View | undefined>
}) => createDerivedStore<DataViewPageHeader>({
  get: () => {
    const currentView = read(input.currentViewStore)
    return {
      viewId: read(input.activeViewIdStore),
      viewType: currentView?.type,
      viewName: currentView?.name
    }
  },
  isEqual: sameHeader
})

export const createPageModel = (input: {
  document: ReadStore<DataDoc>
  activeViewIdStore: ReadStore<ViewId | undefined>
  currentViewStore: ReadStore<View | undefined>
  activeStateStore: ReadStore<ViewState | undefined>
  pageStateStore: ReadStore<PageState>
}): DataViewPageRuntime => {
  const documentFields = createDocumentFieldsStore(input.document)
  const documentViews = createDocumentViewsStore(input.document)
  const body = createPageBodyStore({
    currentViewStore: input.currentViewStore,
    activeStateStore: input.activeStateStore
  })
  const header = createPageHeaderStore({
    activeViewIdStore: input.activeViewIdStore,
    currentViewStore: input.currentViewStore
  })

  const toolbar = createDerivedStore<DataViewPageToolbar>({
    get: () => {
      const fields = read(documentFields)
      const views = read(documentViews)
      const currentView = read(input.currentViewStore)
      const activeState = read(input.activeStateStore)
      const queryBar = read(input.pageStateStore).query
      const filterRules = activeState?.query.filters.rules ?? []
      const sortRules = activeState?.query.sort.rules ?? []

      return {
        views,
        currentView,
        activeViewId: read(input.activeViewIdStore),
        queryBar,
        search: activeState?.query.search.query ?? '',
        filterCount: filterRules.length,
        sortCount: sortRules.length,
        availableFilterFields: getAvailableFilterFields(
          fields,
          filterRules.map(entry => entry.rule)
        ),
        availableSortFields: getAvailableSorterFields(
          fields,
          sortRules.map(entry => entry.sorter)
        )
      }
    },
    isEqual: sameToolbar
  })

  const queryBar = createDerivedStore<DataViewPageQueryBar>({
    get: () => {
      const fields = read(documentFields)
      const currentView = read(input.currentViewStore)
      const activeState = read(input.activeStateStore)
      const query = read(input.pageStateStore).query
      const filters = activeState?.query.filters.rules ?? []
      const sorts = activeState?.query.sort.rules ?? []

      return {
        visible: query.visible,
        route: query.route,
        currentView,
        filters,
        sorts,
        availableFilterFields: getAvailableFilterFields(
          fields,
          filters.map(entry => entry.rule)
        ),
        availableSortFields: getAvailableSorterFields(
          fields,
          sorts.map(entry => entry.sorter)
        )
      }
    },
    isEqual: sameQueryBarView
  })

  const settings = createDerivedStore<DataViewPageSettings>({
    get: () => {
      const fields = read(documentFields)
      const views = read(documentViews)
      const currentView = read(input.currentViewStore)
      const activeState = read(input.activeStateStore)

      return {
        viewsCount: views.length,
        fields,
        currentView,
        filter: activeState?.query.filters,
        sort: activeState?.query.sort,
        group: activeState?.query.group
      }
    },
    isEqual: sameSettings
  })

  return {
    body,
    header,
    toolbar,
    queryBar,
    settings
  }
}

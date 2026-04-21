import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import {
  queryRead
} from '@dataview/engine'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  PageBody,
  PageHeader,
  PageModel,
  PageQuery,
  PageSortPanel,
  PageSortRow,
  PageSettings,
  PageToolbar
} from '@dataview/runtime/model/page/types'
import type {
  PageState
} from '@dataview/runtime/page/session/types'
import {
  createEntityListStore
} from '@dataview/runtime/model/internal/list'
import {
  query as queryApi
} from '@dataview/runtime/model/queryFields'

const EMPTY_FIELD_IDS: readonly FieldId[] = []
const EMPTY_FIELDS: readonly Field[] = []

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
  && equal.sameOrder(left.views, right.views)
  && equal.sameOrder(left.availableFilterFields, right.availableFilterFields)
  && equal.sameOrder(left.availableSortFields, right.availableSortFields)

const sameQuery = (
  left: PageQuery,
  right: PageQuery
) => left.visible === right.visible
  && sameRoute(left.route, right.route)
  && left.currentView === right.currentView
  && left.filters === right.filters
  && left.sorts === right.sorts
  && equal.sameOrder(left.availableFilterFields, right.availableFilterFields)
  && equal.sameOrder(left.availableSortFields, right.availableSortFields)

const sameSettings = (
  left: PageSettings,
  right: PageSettings
) => left.viewsCount === right.viewsCount
  && left.currentView === right.currentView
  && left.filter === right.filter
  && left.sort === right.sort
  && left.group === right.group
  && equal.sameOrder(left.displayFieldIds, right.displayFieldIds)
  && equal.sameOrder(left.visibleFields, right.visibleFields)
  && equal.sameOrder(left.hiddenFields, right.hiddenFields)
  && equal.sameOrder(left.fields, right.fields)

const sameSortPanel = (
  left: PageSortPanel,
  right: PageSortPanel
) => equal.sameOrder(left.rules, right.rules)
  && equal.sameOrder(left.availableFields, right.availableFields)

const sameSortRow = (
  left: PageSortRow | undefined,
  right: PageSortRow | undefined
) => left === right || (
  !!left
  && !!right
  && left.sorter === right.sorter
  && left.field === right.field
  && equal.sameOrder(left.availableFields, right.availableFields)
)

const createAvailableFieldsStore = (input: {
  fields: store.ReadStore<readonly Field[]>
  usedFieldIds: store.ReadStore<readonly FieldId[]>
}) => store.createDerivedStore<readonly Field[]>({
  get: () => {
    const fields = store.read(input.fields)
    const usedFieldIds = store.read(input.usedFieldIds)
    if (!usedFieldIds.length) {
      return fields
    }

    const usedFieldIdSet = new Set(usedFieldIds)
    return fields.filter(field => !usedFieldIdSet.has(field.id))
  },
  isEqual: equal.sameOrder
})

export const createPageModel = (input: {
  source: DataViewSource
  pageStateStore: store.ReadStore<PageState>
}): PageModel => {
  const fields = store.createDerivedStore<readonly Field[]>({
    get: () => store.read(input.source.doc.fields.ids)
      .flatMap(fieldId => {
        const field = store.read(input.source.doc.fields, fieldId)
        return field ? [field] : []
      }),
    isEqual: equal.sameOrder
  })
  const views = createEntityListStore({
    ids: input.source.doc.views.ids,
    values: input.source.doc.views
  })
  const currentView = store.createDerivedStore<View | undefined>({
    get: () => {
      const viewId = store.read(input.source.active.view.id)
      return viewId
        ? store.read(input.source.doc.views, viewId)
        : undefined
    },
    isEqual: Object.is
  })
  const filterFieldIds = store.createDerivedStore<readonly FieldId[]>({
    get: () => queryRead.filterFieldIds(store.read(input.source.active.query)),
    isEqual: equal.sameOrder
  })
  const sortFieldIds = store.createDerivedStore<readonly FieldId[]>({
    get: () => queryRead.sortFieldIds(store.read(input.source.active.query)),
    isEqual: equal.sameOrder
  })
  const availableFilterFields = createAvailableFieldsStore({
    fields,
    usedFieldIds: filterFieldIds
  })
  const availableSortFields = createAvailableFieldsStore({
    fields,
    usedFieldIds: sortFieldIds
  })
  const filterCount = store.createDerivedStore<number>({
    get: () => store.read(input.source.active.query).filters.rules.length,
    isEqual: Object.is
  })
  const sortCount = store.createDerivedStore<number>({
    get: () => store.read(input.source.active.query).sort.rules.length,
    isEqual: Object.is
  })
  const sortRules = store.createDerivedStore<PageSortPanel['rules']>({
    get: () => store.read(input.source.active.query).sort.rules,
    isEqual: equal.sameOrder
  })
  const displayFieldIds = store.createDerivedStore<readonly FieldId[]>({
    get: () => store.read(currentView)?.display.fields ?? EMPTY_FIELD_IDS,
    isEqual: equal.sameOrder
  })
  const visibleFields = store.createDerivedStore<readonly Field[]>({
    get: () => {
      const orderedFieldIds = store.read(displayFieldIds)
      if (!orderedFieldIds.length) {
        return EMPTY_FIELDS
      }

      const fieldById = new Map(store.read(fields).map(field => [field.id, field] as const))
      return orderedFieldIds.flatMap(fieldId => {
        const field = fieldById.get(fieldId)
        return field
          ? [field]
          : []
      })
    },
    isEqual: equal.sameOrder
  })
  const hiddenFields = store.createDerivedStore<readonly Field[]>({
    get: () => {
      const allFields = store.read(fields)
      const shownFieldIds = store.read(displayFieldIds)
      if (!shownFieldIds.length) {
        return allFields
      }

      const shownFieldIdSet = new Set(shownFieldIds)
      return allFields.filter(field => !shownFieldIdSet.has(field.id))
    },
    isEqual: equal.sameOrder
  })

  const body = store.createDerivedStore<PageBody>({
    get: () => ({
      viewType: store.read(input.source.active.view.type),
      empty: store.read(input.source.active.items.ids).length === 0
    }),
    isEqual: sameBody
  })

  const header = store.createDerivedStore<PageHeader>({
    get: () => {
      const view = store.read(currentView)
      return {
        viewId: store.read(input.source.active.view.id),
        viewType: view?.type,
        viewName: view?.name
      }
    },
    isEqual: sameHeader
  })

  const toolbar = store.createDerivedStore<PageToolbar>({
    get: () => {
      const pageState = store.read(input.pageStateStore)

      return {
        views: store.read(views),
        currentView: store.read(currentView),
        activeViewId: store.read(input.source.active.view.id),
        queryBar: pageState.query,
        search: store.read(input.source.active.query).search.query,
        filterCount: store.read(filterCount),
        sortCount: store.read(sortCount),
        availableFilterFields: store.read(availableFilterFields),
        availableSortFields: store.read(availableSortFields)
      }
    },
    isEqual: sameToolbar
  })

  const query = store.createDerivedStore<PageQuery>({
    get: () => {
      const pageState = store.read(input.pageStateStore)
      return {
        visible: pageState.query.visible,
        route: pageState.query.route,
        currentView: store.read(currentView),
        filters: store.read(input.source.active.query).filters.rules,
        sorts: store.read(sortRules),
        availableFilterFields: store.read(availableFilterFields),
        availableSortFields: store.read(availableSortFields)
      }
    },
    isEqual: sameQuery
  })
  const sortPanel = store.createDerivedStore<PageSortPanel>({
    get: () => ({
      rules: store.read(sortRules),
      availableFields: store.read(availableSortFields)
    }),
    isEqual: sameSortPanel
  })
  const sortRow = store.createKeyedDerivedStore<number, PageSortRow | undefined>({
    get: index => {
      const rules = store.read(sortRules)
      const rule = rules[index]
      if (!rule) {
        return undefined
      }

      const allFields = store.read(fields)
      const sorters = rules.map(entry => entry.sorter)
      return {
        sorter: rule.sorter,
        field: rule.field,
        availableFields: queryApi.fields.available.sortAt(
          allFields,
          sorters,
          index
        )
      }
    },
    isEqual: sameSortRow
  })

  const settings = store.createDerivedStore<PageSettings>({
    get: () => ({
      viewsCount: store.read(input.source.doc.views.ids).length,
      fields: store.read(fields),
      displayFieldIds: store.read(displayFieldIds),
      visibleFields: store.read(visibleFields),
      hiddenFields: store.read(hiddenFields),
      currentView: store.read(currentView),
      filter: store.read(input.source.active.query).filters,
      sort: store.read(input.source.active.query).sort,
      group: store.read(input.source.active.query).group
    }),
    isEqual: sameSettings
  })

  return {
    body,
    header,
    toolbar,
    query,
    sortPanel,
    sortRow,
    settings
  }
}

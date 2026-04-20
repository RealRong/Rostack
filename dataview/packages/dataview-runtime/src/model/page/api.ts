import type {
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  createKeyedDerivedStore,
  createDerivedStore,
  read,
  sameOrder,
  type ReadStore
} from '@shared/core'
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
  query
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
  && sameOrder(left.views, right.views)
  && sameOrder(left.availableFilterFields, right.availableFilterFields)
  && sameOrder(left.availableSortFields, right.availableSortFields)

const sameQuery = (
  left: PageQuery,
  right: PageQuery
) => left.visible === right.visible
  && sameRoute(left.route, right.route)
  && left.currentView === right.currentView
  && left.filters === right.filters
  && left.sorts === right.sorts
  && sameOrder(left.availableFilterFields, right.availableFilterFields)
  && sameOrder(left.availableSortFields, right.availableSortFields)

const sameSettings = (
  left: PageSettings,
  right: PageSettings
) => left.viewsCount === right.viewsCount
  && left.currentView === right.currentView
  && left.filter === right.filter
  && left.sort === right.sort
  && left.group === right.group
  && sameOrder(left.displayFieldIds, right.displayFieldIds)
  && sameOrder(left.visibleFields, right.visibleFields)
  && sameOrder(left.hiddenFields, right.hiddenFields)
  && sameOrder(left.fields, right.fields)

const sameSortPanel = (
  left: PageSortPanel,
  right: PageSortPanel
) => sameOrder(left.rules, right.rules)
  && sameOrder(left.availableFields, right.availableFields)

const sameSortRow = (
  left: PageSortRow | undefined,
  right: PageSortRow | undefined
) => left === right || (
  !!left
  && !!right
  && left.sorter === right.sorter
  && left.field === right.field
  && sameOrder(left.availableFields, right.availableFields)
)

const createAvailableFieldsStore = (input: {
  fields: ReadStore<readonly Field[]>
  usedFieldIds: ReadStore<readonly FieldId[]>
}) => createDerivedStore<readonly Field[]>({
  get: () => {
    const fields = read(input.fields)
    const usedFieldIds = read(input.usedFieldIds)
    if (!usedFieldIds.length) {
      return fields
    }

    const usedFieldIdSet = new Set(usedFieldIds)
    return fields.filter(field => !usedFieldIdSet.has(field.id))
  },
  isEqual: sameOrder
})

export const createPageModel = (input: {
  source: DataViewSource
  pageStateStore: ReadStore<PageState>
}): PageModel => {
  const fields = createDerivedStore<readonly Field[]>({
    get: () => read(input.source.doc.fields.ids)
      .flatMap(fieldId => {
        const field = read(input.source.doc.fields, fieldId)
        return field ? [field] : []
      }),
    isEqual: sameOrder
  })
  const views = createEntityListStore({
    ids: input.source.doc.views.ids,
    values: input.source.doc.views
  })
  const currentView = createDerivedStore<View | undefined>({
    get: () => {
      const viewId = read(input.source.active.view.id)
      return viewId
        ? read(input.source.doc.views, viewId)
        : undefined
    },
    isEqual: Object.is
  })
  const availableFilterFields = createAvailableFieldsStore({
    fields,
    usedFieldIds: input.source.active.query.filterFieldIds
  })
  const availableSortFields = createAvailableFieldsStore({
    fields,
    usedFieldIds: input.source.active.query.sortFieldIds
  })
  const filterCount = createDerivedStore<number>({
    get: () => read(input.source.active.query.filters).rules.length,
    isEqual: Object.is
  })
  const sortCount = createDerivedStore<number>({
    get: () => read(input.source.active.query.sort).rules.length,
    isEqual: Object.is
  })
  const sortRules = createDerivedStore<PageSortPanel['rules']>({
    get: () => read(input.source.active.query.sort).rules,
    isEqual: sameOrder
  })
  const displayFieldIds = createDerivedStore<readonly FieldId[]>({
    get: () => read(currentView)?.display.fields ?? EMPTY_FIELD_IDS,
    isEqual: sameOrder
  })
  const visibleFields = createDerivedStore<readonly Field[]>({
    get: () => {
      const orderedFieldIds = read(displayFieldIds)
      if (!orderedFieldIds.length) {
        return EMPTY_FIELDS
      }

      const fieldById = new Map(read(fields).map(field => [field.id, field] as const))
      return orderedFieldIds.flatMap(fieldId => {
        const field = fieldById.get(fieldId)
        return field
          ? [field]
          : []
      })
    },
    isEqual: sameOrder
  })
  const hiddenFields = createDerivedStore<readonly Field[]>({
    get: () => {
      const allFields = read(fields)
      const shownFieldIds = read(displayFieldIds)
      if (!shownFieldIds.length) {
        return allFields
      }

      const shownFieldIdSet = new Set(shownFieldIds)
      return allFields.filter(field => !shownFieldIdSet.has(field.id))
    },
    isEqual: sameOrder
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
      const view = read(currentView)
      return {
        viewId: read(input.source.active.view.id),
        viewType: view?.type,
        viewName: view?.name
      }
    },
    isEqual: sameHeader
  })

  const toolbar = createDerivedStore<PageToolbar>({
    get: () => {
      const pageState = read(input.pageStateStore)

      return {
        views: read(views),
        currentView: read(currentView),
        activeViewId: read(input.source.active.view.id),
        queryBar: pageState.query,
        search: read(input.source.active.query.search).query,
        filterCount: read(filterCount),
        sortCount: read(sortCount),
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
        currentView: read(currentView),
        filters: read(input.source.active.query.filters).rules,
        sorts: read(sortRules),
        availableFilterFields: read(availableFilterFields),
        availableSortFields: read(availableSortFields)
      }
    },
    isEqual: sameQuery
  })
  const sortPanel = createDerivedStore<PageSortPanel>({
    get: () => ({
      rules: read(sortRules),
      availableFields: read(availableSortFields)
    }),
    isEqual: sameSortPanel
  })
  const sortRow = createKeyedDerivedStore<number, PageSortRow | undefined>({
    get: index => {
      const rules = read(sortRules)
      const rule = rules[index]
      if (!rule) {
        return undefined
      }

      const allFields = read(fields)
      const sorters = rules.map(entry => entry.sorter)
      return {
        sorter: rule.sorter,
        field: rule.field,
        availableFields: query.fields.available.sortAt(
          allFields,
          sorters,
          index
        )
      }
    },
    isEqual: sameSortRow
  })

  const settings = createDerivedStore<PageSettings>({
    get: () => ({
      viewsCount: read(input.source.doc.views.ids).length,
      fields: read(fields),
      displayFieldIds: read(displayFieldIds),
      visibleFields: read(visibleFields),
      hiddenFields: read(hiddenFields),
      currentView: read(currentView),
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
    sortPanel,
    sortRow,
    settings
  }
}

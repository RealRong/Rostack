import type {
  CustomField,
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import type {
  ActiveViewQuery
} from '@dataview/engine'
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
  EngineSource
} from '@dataview/runtime/source'
import {
  queryFieldOptions
} from '@dataview/runtime/model/page/queryFieldOptions'
import {
  resolvePageQueryBarState,
  resolvePageSettingsState,
  type PageSessionState
} from '@dataview/runtime/session/page'

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
  && left.valueEditorOpen === right.valueEditorOpen
  && left.locked === right.locked

const sameHeader = (
  left: PageHeader,
  right: PageHeader
) => left.viewId === right.viewId
  && left.viewType === right.viewType
  && left.viewName === right.viewName

const sameToolbar = (
  left: PageToolbar,
  right: PageToolbar
) => left.activeView === right.activeView
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
  && left.activeView === right.activeView
  && left.filters === right.filters
  && left.sorts === right.sorts
  && equal.sameOrder(left.availableFilterFields, right.availableFilterFields)
  && equal.sameOrder(left.availableSortFields, right.availableSortFields)

const sameSettingsRoute = (
  left: PageSettings['route'],
  right: PageSettings['route']
) => left.kind === right.kind
  && (
    left.kind !== 'fieldSchema'
    || right.kind !== 'fieldSchema'
    || left.fieldId === right.fieldId
  )
  && (
    left.kind !== 'root'
    || right.kind !== 'root'
    || left.focusTarget === right.focusTarget
  )

const sameSettings = (
  left: PageSettings,
  right: PageSettings
) => left.visible === right.visible
  && sameSettingsRoute(left.route, right.route)
  && left.viewsCount === right.viewsCount
  && left.activeView === right.activeView
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

const createAvailableFieldsStore = <TField extends Field>(input: {
  fields: store.ReadStore<readonly TField[]>
  usedFieldIds: store.ReadStore<readonly FieldId[]>
}) => store.createDerivedStore<readonly TField[]>({
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
  source: EngineSource
  pageSessionStore: store.ReadStore<PageSessionState>
  valueEditorOpenStore: store.ReadStore<boolean>
}): PageModel => {
  const customFields = input.source.doc.fields.list
  const views = input.source.doc.views.list
  const activeView = input.source.active.view.current
  const filterFieldIds = store.createDerivedStore<readonly FieldId[]>({
    get: () => {
      const ids = queryFieldOptions.used.filterIds(
        store.read(input.source.active.query).filters.rules.map(rule => rule.rule)
      )
      return ids.length
        ? ids
        : EMPTY_FIELD_IDS
    },
    isEqual: equal.sameOrder
  })
  const sortFieldIds = store.createDerivedStore<readonly FieldId[]>({
    get: () => {
      const ids = queryFieldOptions.used.sortIds(
        store.read(input.source.active.query).sort.rules.map(rule => rule.sorter)
      )
      return ids.length
        ? ids
        : EMPTY_FIELD_IDS
    },
    isEqual: equal.sameOrder
  })
  const availableFilterFields = createAvailableFieldsStore({
    fields: customFields,
    usedFieldIds: filterFieldIds
  })
  const availableSortFields = createAvailableFieldsStore({
    fields: customFields,
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
  const queryBar = store.createDerivedStore<PageToolbar['queryBar']>({
    get: () => resolvePageQueryBarState({
      activeView: store.read(activeView),
      query: store.read(input.pageSessionStore).query
    }),
    isEqual: sameQueryBar
  })
  const settingsState = store.createDerivedStore<{
    visible: boolean
    route: PageSettings['route']
  }>({
    get: () => resolvePageSettingsState({
      fields: store.read(customFields),
      activeViewId: store.read(input.source.active.view.id),
      activeViewType: store.read(input.source.active.view.type),
      settings: store.read(input.pageSessionStore).settings
    }),
    isEqual: (left, right) => (
      left.visible === right.visible
      && sameSettingsRoute(left.route, right.route)
    )
  })
  const displayFieldIds = store.createDerivedStore<readonly FieldId[]>({
    get: () => store.read(activeView)?.display.fields ?? EMPTY_FIELD_IDS,
    isEqual: equal.sameOrder
  })
  const visibleFields = store.createDerivedStore<readonly Field[]>({
    get: () => {
      const orderedFieldIds = store.read(displayFieldIds)
      if (!orderedFieldIds.length) {
        return EMPTY_FIELDS
      }

      const fieldById = new Map(store.read(customFields).map(field => [field.id, field] as const))
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
      const allFields = store.read(customFields)
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
      empty: store.read(input.source.active.items.list).count === 0,
      valueEditorOpen: store.read(input.valueEditorOpenStore),
      locked: store.read(input.valueEditorOpenStore)
    }),
    isEqual: sameBody
  })

  const header = store.createDerivedStore<PageHeader>({
    get: () => {
      const view = store.read(activeView)
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
      return {
        views: store.read(views),
        activeView: store.read(activeView),
        activeViewId: store.read(input.source.active.view.id),
        queryBar: store.read(queryBar),
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
      const currentQueryBar = store.read(queryBar)
      return {
        visible: currentQueryBar.visible,
        route: currentQueryBar.route,
        activeView: store.read(activeView),
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

      const allFields = store.read(customFields)
      const sorters = rules.map(entry => entry.sorter)
      return {
        sorter: rule.sorter,
        field: rule.field,
        availableFields: queryFieldOptions.available.sortAt(
          allFields,
          sorters,
          index
        )
      }
    },
    isEqual: sameSortRow
  })

  const settings = store.createDerivedStore<PageSettings>({
    get: () => {
      const currentSettings = store.read(settingsState)
      return {
        visible: currentSettings.visible,
        route: currentSettings.route,
        viewsCount: store.read(views).length,
        fields: store.read(customFields),
        displayFieldIds: store.read(displayFieldIds),
        visibleFields: store.read(visibleFields),
        hiddenFields: store.read(hiddenFields),
        activeView: store.read(activeView),
        filter: store.read(input.source.active.query).filters,
        sort: store.read(input.source.active.query).sort,
        group: store.read(input.source.active.query).group
      }
    },
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

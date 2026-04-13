import type {
  DataDoc,
  EntityTable,
  Filter,
  View,
  RecordId,
  ViewDisplay,
  ViewId
} from '#core/contracts/state'
import { normalizeViewCalculations } from '#core/calculation'
import { normalizeGroup } from '#core/group'
import { normalizeSearch } from '#core/search'
import { normalizeSorters } from '#core/sort'
import { getDocumentFields } from '#core/document/fields'
import { normalizeRecordOrderIds } from '#core/view/order'
import { normalizeViewOptions } from '#core/view/normalize'
import {
  cloneEntityInput,
  normalizeEntityTable,
  putEntityTableEntity,
  removeEntityTableEntity
} from '#core/document/table'

const replaceDocumentViewsTable = (document: DataDoc, views: EntityTable<ViewId, View>): DataDoc => {
  if (views === document.views) {
    return document
  }

  return {
    ...document,
    views
  }
}

const createValidRecordIdSet = (document: DataDoc) => new Set<RecordId>(document.records.order)

export const normalizeViewOrders = (
  document: DataDoc,
  orders: readonly RecordId[] | undefined
) => normalizeRecordOrderIds(orders, createValidRecordIdSet(document))

const normalizeFieldIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
)

const normalizeDocumentViewFilter = (filter: unknown): Filter => {
  const source = typeof filter === 'object' && filter !== null
    ? filter as {
        mode?: unknown
        rules?: unknown
      }
    : undefined

  return {
    mode: source?.mode === 'or' ? 'or' : 'and',
    rules: Array.isArray(source?.rules)
      ? source.rules
          .filter(rule => typeof rule === 'object' && rule !== null)
          .map(rule => {
            const currentRule = rule as {
              fieldId?: unknown
              presetId?: unknown
              value?: unknown
            }
            return {
              fieldId: typeof currentRule.fieldId === 'string' ? currentRule.fieldId : '',
              presetId: typeof currentRule.presetId === 'string' ? currentRule.presetId : '',
              ...(Object.prototype.hasOwnProperty.call(currentRule, 'value')
                ? { value: structuredClone(currentRule.value) as Filter['rules'][number]['value'] }
                : {})
            }
          })
      : []
  }
}

const normalizeDocumentViewDisplay = (display: unknown): ViewDisplay => {
  const source = typeof display === 'object' && display !== null
    ? display as {
        fields?: unknown
      }
    : undefined

  return {
    fields: normalizeFieldIdList(source?.fields)
  }
}

const normalizeDocumentView = (
  document: DataDoc,
  view: View
): View => {
  const fields = getDocumentFields(document)
  const normalizedOptions = normalizeViewOptions(view.options, {
    type: view.type,
    fields
  })
  const group = normalizeGroup(view.group)

  return {
    ...cloneEntityInput(view),
    search: normalizeSearch(view.search),
    filter: normalizeDocumentViewFilter(view.filter),
    sort: normalizeSorters(view.sort),
    ...(group
      ? { group }
      : {}),
    calc: normalizeViewCalculations(view.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
    }),
    display: normalizeDocumentViewDisplay(view.display),
    options: normalizedOptions,
    orders: normalizeViewOrders(document, view.orders)
  }
}

export const normalizeDocumentViews = (document: DataDoc): EntityTable<ViewId, View> => {
  const views = normalizeEntityTable(document.views)
  const byId = {} as Record<ViewId, View>

  views.order.forEach(viewId => {
    const view = views.byId[viewId]
    if (!view) {
      return
    }

    byId[viewId] = normalizeDocumentView(document, view)
  })

  return {
    byId,
    order: views.order
  }
}

export const getDocumentViews = (document: DataDoc): View[] => {
  return document.views.order
    .map(viewId => document.views.byId[viewId])
    .filter((view): view is View => Boolean(view))
}

export const getDocumentViewIds = (document: DataDoc): ViewId[] => document.views.order.slice()
export const getDocumentViewById = (document: DataDoc, viewId: ViewId) => document.views.byId[viewId]
export const hasDocumentView = (document: DataDoc, viewId: ViewId) => Boolean(document.views.byId[viewId])

export const resolveDocumentActiveViewId = (
  document: DataDoc,
  preferredViewId?: ViewId
): ViewId | undefined => {
  const candidate = preferredViewId ?? document.activeViewId
  if (candidate && hasDocumentView(document, candidate)) {
    return candidate
  }

  return document.views.order[0]
}

export const getDocumentActiveViewId = (
  document: DataDoc
): ViewId | undefined => resolveDocumentActiveViewId(document)

export const getDocumentActiveView = (
  document: DataDoc
): View | undefined => {
  const viewId = getDocumentActiveViewId(document)
  return viewId
    ? getDocumentViewById(document, viewId)
    : undefined
}

export const setDocumentActiveViewId = (
  document: DataDoc,
  viewId?: ViewId
): DataDoc => {
  const nextViewId = resolveDocumentActiveViewId(document, viewId)
  if (document.activeViewId === nextViewId) {
    return document
  }

  return {
    ...document,
    activeViewId: nextViewId
  }
}

export const putDocumentView = (document: DataDoc, view: View): DataDoc => {
  const nextDocument = replaceDocumentViewsTable(
    document,
    putEntityTableEntity(document.views, view)
  )

  return setDocumentActiveViewId(
    nextDocument,
    nextDocument.activeViewId ?? view.id
  )
}

export const removeDocumentView = (document: DataDoc, viewId: ViewId): DataDoc => {
  if (!document.views.byId[viewId]) {
    return document
  }

  const nextDocument = replaceDocumentViewsTable(
    document,
    removeEntityTableEntity(document.views, viewId)
  )

  return setDocumentActiveViewId(
    nextDocument,
    document.activeViewId === viewId
      ? undefined
      : document.activeViewId
  )
}

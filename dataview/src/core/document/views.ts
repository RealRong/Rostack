import type {
  BucketState,
  BucketSort,
  DataDoc,
  EntityTable,
  FilterOperator,
  View,
  RecordId,
  ViewId
} from '../contracts/state'
import { getDocumentFields } from './fields'
import { normalizeRecordOrderIds } from '../view/order'
import { normalizeViewOptions } from '../view/normalize'
import { normalizeViewQuery } from '../query'
import {
  cloneEntityInput,
  normalizeEntityTable
} from './shared'

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

const normalizeFilterOperator = (value: unknown): FilterOperator => (
  typeof value === 'string'
    ? value as FilterOperator
    : 'custom'
)

const normalizeBucketSort = (value: unknown): BucketSort => (
  typeof value === 'string'
    ? value as BucketSort
    : 'manual'
)

const normalizeBucketState = (
  value: unknown
): BucketState | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const next: BucketState = {
    ...((value as { hidden?: unknown }).hidden === true ? { hidden: true } : {}),
    ...((value as { collapsed?: unknown }).collapsed === true ? { collapsed: true } : {})
  }

  return Object.keys(next).length
    ? next
    : undefined
}

const normalizeBuckets = (value: unknown): Readonly<Record<string, BucketState>> | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const next = Object.fromEntries(
    Object.entries(value)
      .flatMap(([key, state]) => {
        const normalizedKey = typeof key === 'string' ? key.trim() : ''
        const normalizedState = normalizeBucketState(state)
        return normalizedKey && normalizedState
          ? [[normalizedKey, normalizedState] as const]
          : []
      })
  )

  return Object.keys(next).length
    ? next
    : undefined
}

const normalizeDocumentViewQuery = (query: unknown) => {
  const source = typeof query === 'object' && query !== null
    ? query as {
        search?: {
          query?: unknown
          fields?: unknown
        }
        filter?: {
          mode?: unknown
          rules?: unknown
        }
        sorters?: unknown
        group?: {
          field?: unknown
          mode?: unknown
          bucketSort?: unknown
          bucketInterval?: unknown
          showEmpty?: unknown
          buckets?: unknown
        } | undefined
      }
    : undefined

  const buckets = normalizeBuckets(source?.group?.buckets)
  const nextGroup = source?.group && typeof source.group.field === 'string'
    ? {
        field: source.group.field,
        mode: typeof source.group.mode === 'string' ? source.group.mode : '',
        bucketSort: normalizeBucketSort(source.group.bucketSort),
        ...(typeof source.group.bucketInterval === 'number'
          ? { bucketInterval: source.group.bucketInterval }
          : {}),
        ...(typeof source.group.showEmpty === 'boolean'
          ? { showEmpty: source.group.showEmpty }
          : {}),
        ...(buckets
          ? { buckets }
          : {})
      }
    : undefined

  return {
    search: {
      query: typeof source?.search?.query === 'string' ? source.search.query : '',
      ...(Array.isArray(source?.search?.fields)
        ? { fields: source.search.fields.filter(value => typeof value === 'string') }
        : {})
    },
    filter: {
      mode: source?.filter?.mode === 'or' ? 'or' : 'and',
      rules: Array.isArray(source?.filter?.rules)
        ? source.filter.rules
            .filter(rule => typeof rule === 'object' && rule !== null)
            .map(rule => {
              const currentRule = rule as {
                field?: unknown
                op?: unknown
                value?: unknown
              }
              return {
                field: typeof currentRule.field === 'string' ? currentRule.field : '',
                op: normalizeFilterOperator(currentRule.op),
                ...(Object.prototype.hasOwnProperty.call(currentRule, 'value')
                  ? { value: structuredClone(currentRule.value) }
                  : {})
              }
            })
        : []
    },
    sorters: Array.isArray(source?.sorters)
      ? source.sorters
          .filter(sorter => typeof sorter === 'object' && sorter !== null)
          .map(sorter => {
            const currentSorter = sorter as {
              field?: unknown
              direction?: unknown
            }
            return {
              field: typeof currentSorter.field === 'string' ? currentSorter.field : '',
              direction: currentSorter.direction === 'desc' ? 'desc' : 'asc'
            }
          })
      : [],
    ...(nextGroup ? { group: nextGroup } : {})
  } satisfies View['query']
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

  return {
    ...cloneEntityInput(view),
    query: normalizeDocumentViewQuery(view.query),
    aggregates: Array.isArray(view.aggregates)
      ? structuredClone(view.aggregates)
      : [],
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

export const putDocumentView = (document: DataDoc, view: View): DataDoc => {
  const exists = Boolean(document.views.byId[view.id])
  const nextView = cloneEntityInput(view)

  return replaceDocumentViewsTable(document, {
    byId: {
      ...document.views.byId,
      [view.id]: nextView
    },
    order: exists ? document.views.order : [...document.views.order, view.id]
  })
}

export const removeDocumentView = (document: DataDoc, viewId: ViewId): DataDoc => {
  if (!document.views.byId[viewId]) {
    return document
  }

  const nextById = { ...document.views.byId }
  delete nextById[viewId]

  return replaceDocumentViewsTable(document, {
    byId: nextById,
    order: document.views.order.filter(id => id !== viewId)
  })
}

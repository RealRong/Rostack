import type {
  BucketState,
  GroupBucketSort,
  GroupDocument,
  GroupEntityTable,
  GroupFilterOperator,
  GroupView,
  RecordId,
  ViewId
} from '../contracts/state'
import { getDocumentProperties } from './properties'
import { normalizeRecordOrderIds } from '../view/order'
import { normalizeGroupViewOptions } from '../view/normalize'
import { normalizeGroupViewQuery } from '../query'
import {
  cloneEntityInput,
  normalizeEntityTable
} from './shared'

const replaceDocumentViewsTable = (document: GroupDocument, views: GroupEntityTable<ViewId, GroupView>): GroupDocument => {
  if (views === document.views) {
    return document
  }

  return {
    ...document,
    views
  }
}

const createValidRecordIdSet = (document: GroupDocument) => new Set<RecordId>(document.records.order)

export const normalizeViewOrders = (
  document: GroupDocument,
  orders: readonly RecordId[] | undefined
) => normalizeRecordOrderIds(orders, createValidRecordIdSet(document))

const normalizeFilterOperator = (value: unknown): GroupFilterOperator => (
  typeof value === 'string'
    ? value as GroupFilterOperator
    : 'custom'
)

const normalizeBucketSort = (value: unknown): GroupBucketSort => (
  typeof value === 'string'
    ? value as GroupBucketSort
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
          properties?: unknown
        }
        filter?: {
          mode?: unknown
          rules?: unknown
        }
        sorters?: unknown
        group?: {
          property?: unknown
          mode?: unknown
          bucketSort?: unknown
          bucketInterval?: unknown
          showEmpty?: unknown
          buckets?: unknown
        } | undefined
      }
    : undefined

  const buckets = normalizeBuckets(source?.group?.buckets)
  const nextGroup = source?.group && typeof source.group.property === 'string'
    ? {
        property: source.group.property,
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
      ...(Array.isArray(source?.search?.properties)
        ? { properties: source.search.properties.filter(value => typeof value === 'string') }
        : {})
    },
    filter: {
      mode: source?.filter?.mode === 'or' ? 'or' : 'and',
      rules: Array.isArray(source?.filter?.rules)
        ? source.filter.rules
            .filter(rule => typeof rule === 'object' && rule !== null)
            .map(rule => {
              const currentRule = rule as {
                property?: unknown
                op?: unknown
                value?: unknown
              }
              return {
                property: typeof currentRule.property === 'string' ? currentRule.property : '',
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
              property?: unknown
              direction?: unknown
            }
            return {
              property: typeof currentSorter.property === 'string' ? currentSorter.property : '',
              direction: currentSorter.direction === 'desc' ? 'desc' : 'asc'
            }
          })
      : [],
    ...(nextGroup ? { group: nextGroup } : {})
  } satisfies GroupView['query']
}

const normalizeDocumentView = (
  document: GroupDocument,
  view: GroupView
): GroupView => {
  const properties = getDocumentProperties(document)
  const normalizedOptions = normalizeGroupViewOptions(view.options, {
    type: view.type,
    properties
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

export const normalizeDocumentViews = (document: GroupDocument): GroupEntityTable<ViewId, GroupView> => {
  const views = normalizeEntityTable(document.views)
  const byId = {} as Record<ViewId, GroupView>

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

export const getDocumentViews = (document: GroupDocument): GroupView[] => {
  return document.views.order
    .map(viewId => document.views.byId[viewId])
    .filter((view): view is GroupView => Boolean(view))
}

export const getDocumentViewIds = (document: GroupDocument): ViewId[] => document.views.order.slice()
export const getDocumentViewById = (document: GroupDocument, viewId: ViewId) => document.views.byId[viewId]
export const hasDocumentView = (document: GroupDocument, viewId: ViewId) => Boolean(document.views.byId[viewId])

export const putDocumentView = (document: GroupDocument, view: GroupView): GroupDocument => {
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

export const removeDocumentView = (document: GroupDocument, viewId: ViewId): GroupDocument => {
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

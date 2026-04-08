import type {
  BucketState,
  BucketSort,
  DataDoc,
  EntityTable,
  Filter,
  Search,
  Sorter,
  View,
  RecordId,
  ViewDisplay,
  ViewGroup,
  ViewId
} from '../contracts/state'
import { normalizeViewCalculations } from '@dataview/core/calculation'
import { getDocumentFields } from './fields'
import { normalizeRecordOrderIds } from '../view/order'
import { normalizeViewOptions } from '../view/normalize'
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

const normalizeFieldIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
)

const normalizeDocumentViewSearch = (search: unknown): Search => {
  const source = typeof search === 'object' && search !== null
    ? search as {
        query?: unknown
        fields?: unknown
      }
    : undefined

  return {
    query: typeof source?.query === 'string' ? source.query : '',
    ...(Array.isArray(source?.fields)
      ? { fields: normalizeFieldIdList(source.fields) }
      : {})
  }
}

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

const normalizeDocumentViewSort = (sort: unknown): Sorter[] => (
  Array.isArray(sort)
    ? sort
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
    : []
)

const normalizeDocumentViewGroup = (group: unknown): ViewGroup | undefined => {
  const source = typeof group === 'object' && group !== null
    ? group as {
        field?: unknown
        mode?: unknown
        bucketSort?: unknown
        bucketInterval?: unknown
        showEmpty?: unknown
        buckets?: unknown
      }
    : undefined

  const buckets = normalizeBuckets(source?.buckets)
  return source && typeof source.field === 'string'
    ? {
        field: source.field,
        mode: typeof source.mode === 'string' ? source.mode : '',
        bucketSort: normalizeBucketSort(source.bucketSort),
        ...(typeof source.bucketInterval === 'number'
          ? { bucketInterval: source.bucketInterval }
          : {}),
        ...(typeof source.showEmpty === 'boolean'
          ? { showEmpty: source.showEmpty }
          : {}),
        ...(buckets
          ? { buckets }
          : {})
      }
    : undefined
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
  const group = normalizeDocumentViewGroup(view.group)

  return {
    ...cloneEntityInput(view),
    search: normalizeDocumentViewSearch(view.search),
    filter: normalizeDocumentViewFilter(view.filter),
    sort: normalizeDocumentViewSort(view.sort),
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

import type {
  DataDoc,
  EntityTable,
  View,
  RecordId,
  ViewId
} from '#core/contracts/state.ts'
import { normalizeViewCalculations } from '#core/calculation/index.ts'
import { normalizeFilter } from '#core/filter/index.ts'
import { normalizeGroup } from '#core/group/index.ts'
import { normalizeSearch } from '#core/search/index.ts'
import { normalizeSorters } from '#core/sort/index.ts'
import { getDocumentFields } from '#core/document/fields.ts'
import { normalizeRecordOrderIds } from '#core/view/order.ts'
import { normalizeViewOptions } from '#core/view/normalize.ts'
import { normalizeViewDisplay } from '#core/view/state.ts'
import {
  cloneEntityInput,
  normalizeEntityTable,
  putEntityTableEntity,
  replaceDocumentTable,
  removeEntityTableEntity
} from '#core/document/table.ts'

const createValidRecordIdSet = (document: DataDoc) => new Set<RecordId>(document.records.order)

export const normalizeViewOrders = (
  document: DataDoc,
  orders: readonly RecordId[] | undefined
) => normalizeRecordOrderIds(orders, createValidRecordIdSet(document))

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
    filter: normalizeFilter(view.filter),
    sort: normalizeSorters(view.sort),
    ...(group
      ? { group }
      : {}),
    calc: normalizeViewCalculations(view.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
    }),
    display: normalizeViewDisplay(view.display),
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
  const nextDocument = replaceDocumentTable(
    document,
    'views',
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

  const nextDocument = replaceDocumentTable(
    document,
    'views',
    removeEntityTableEntity(document.views, viewId)
  )

  return setDocumentActiveViewId(
    nextDocument,
    document.activeViewId === viewId
      ? undefined
      : document.activeViewId
  )
}

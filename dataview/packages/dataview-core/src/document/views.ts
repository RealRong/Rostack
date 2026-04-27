import type {
  DataDoc,
  EntityTable,
  RecordId,
  View,
  ViewId
} from '@dataview/core/types/state'
import { calculation } from '@dataview/core/view'
import { documentFields } from '@dataview/core/document/fields'
import { entityTable as sharedEntityTable } from '@shared/core'
import { filter } from '@dataview/core/view'
import { group } from '@dataview/core/view'
import { search } from '@dataview/core/view'
import { sort } from '@dataview/core/view'
import { normalizeRecordOrderIds } from '@dataview/core/view/order'
import { normalizeViewOptions } from '@dataview/core/view/normalize'
import { normalizeViewDisplay } from '@dataview/core/view/state'

const replaceTable = <TKey extends 'fields' | 'records' | 'views'>(
  document: DataDoc,
  key: TKey,
  table: DataDoc[TKey]
): DataDoc => document[key] === table
  ? document
  : {
      ...document,
      [key]: table
    }

const createValidRecordIdSet = (document: DataDoc) => new Set<RecordId>(document.records.ids)

const normalizeOrders = (
  document: DataDoc,
  orders: readonly RecordId[] | undefined
) => normalizeRecordOrderIds(orders, createValidRecordIdSet(document))

const resolveDefaultKanbanGroup = (
  document: DataDoc
) => {
  const fields = documentFields.list(document)
  for (let index = 0; index < fields.length; index += 1) {
    const nextGroup = group.set(undefined, fields[index]!)
    if (nextGroup) {
      return nextGroup
    }
  }

  return undefined
}

const normalizeView = (
  document: DataDoc,
  view: View
): View => {
  const fields = documentFields.list(document)
  const normalizedGroup = group.state.normalize(
    'group' in view
      ? view.group
      : undefined
  )
  const normalizedShared = {
    ...sharedEntityTable.clone.entity(view),
    search: search.state.normalize(view.search),
    filter: filter.state.normalize(view.filter),
    sort: {
      rules: sort.rules.normalize(view.sort.rules)
    },
    calc: calculation.view.normalize(view.calc, {
      fields: new Map(fields.map(fieldEntry => [fieldEntry.id, fieldEntry] as const))
    }),
    display: normalizeViewDisplay(view.display),
    orders: normalizeOrders(document, view.orders)
  } as const

  switch (view.type) {
    case 'table':
      return {
        ...normalizedShared,
        type: 'table',
        ...(normalizedGroup
          ? { group: normalizedGroup }
          : {}),
        options: normalizeViewOptions(view.options, {
          type: 'table',
          fields
        })
      }
    case 'gallery':
      return {
        ...normalizedShared,
        type: 'gallery',
        ...(normalizedGroup
          ? { group: normalizedGroup }
          : {}),
        options: normalizeViewOptions(view.options, {
          type: 'gallery',
          fields
        })
      }
    case 'kanban':
      if (!normalizedGroup) {
        const fallbackGroup = resolveDefaultKanbanGroup(document)
        if (!fallbackGroup) {
          throw new Error(`Kanban view ${view.id} requires a groupable field`)
        }

        return {
          ...normalizedShared,
          type: 'kanban',
          group: fallbackGroup,
          options: normalizeViewOptions(view.options, {
            type: 'kanban',
            fields
          })
        }
      }

      return {
        ...normalizedShared,
        type: 'kanban',
        group: normalizedGroup,
        options: normalizeViewOptions(view.options, {
          type: 'kanban',
          fields
        })
      }
  }
}

const normalizeViews = (document: DataDoc): EntityTable<ViewId, View> => {
  const views = sharedEntityTable.normalize.table(document.views)
  const byId = {} as Record<ViewId, View>

  views.ids.forEach(viewId => {
    const view = views.byId[viewId]
    if (!view) {
      return
    }

    byId[viewId] = normalizeView(document, view)
  })

  return {
    byId,
    ids: views.ids
  }
}

const listViews = (document: DataDoc): View[] => {
  return document.views.ids
    .map(viewId => document.views.byId[viewId])
    .filter((view): view is View => Boolean(view))
}

const getViewIds = (document: DataDoc): ViewId[] => document.views.ids.slice()
const getView = (document: DataDoc, viewId: ViewId) => document.views.byId[viewId]
const hasView = (document: DataDoc, viewId: ViewId) => Boolean(document.views.byId[viewId])

const resolveActiveViewId = (
  document: DataDoc,
  preferredViewId?: ViewId
): ViewId | undefined => {
  const candidate = preferredViewId ?? document.activeViewId
  if (candidate && hasView(document, candidate)) {
    return candidate
  }

  return document.views.ids[0]
}

const getActiveViewId = (
  document: DataDoc
): ViewId | undefined => resolveActiveViewId(document)

const getActiveView = (
  document: DataDoc
): View | undefined => {
  const viewId = getActiveViewId(document)
  return viewId
    ? getView(document, viewId)
    : undefined
}

const setActiveViewId = (
  document: DataDoc,
  viewId?: ViewId
): DataDoc => {
  const nextViewId = resolveActiveViewId(document, viewId)
  if (document.activeViewId === nextViewId) {
    return document
  }

  return {
    ...document,
    activeViewId: nextViewId
  }
}

const putView = (document: DataDoc, view: View): DataDoc => {
  const nextDocument = replaceTable(
    document,
    'views',
    sharedEntityTable.write.put(document.views, view)
  )

  return setActiveViewId(
    nextDocument,
    nextDocument.activeViewId ?? view.id
  )
}

const removeView = (document: DataDoc, viewId: ViewId): DataDoc => {
  if (!document.views.byId[viewId]) {
    return document
  }

  const nextDocument = replaceTable(
    document,
    'views',
    sharedEntityTable.write.remove(document.views, viewId)
  )

  return setActiveViewId(
    nextDocument,
    document.activeViewId === viewId
      ? undefined
      : document.activeViewId
  )
}

export const documentViews = {
  list: listViews,
  ids: getViewIds,
  get: getView,
  has: hasView,
  put: putView,
  remove: removeView,
  normalize: normalizeViews,
  order: {
    normalize: normalizeOrders
  },
  activeId: {
    resolve: resolveActiveViewId,
    get: getActiveViewId,
    set: setActiveViewId
  },
  active: {
    get: getActiveView
  }
} as const

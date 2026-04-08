import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentCustomFields,
  getDocumentViewById
} from '@dataview/core/document'
import {
  createDerivedStore,
  type ReadStore
} from '@shared/store'
import {
  cloneSettingsRoute,
  normalizeSettingsRoute
} from '@dataview/react/page/session/settings'
import type {
  PageSessionState,
  QueryBarEntry,
  QueryBarState,
  ResolvedPageState,
  SettingsState
} from '@dataview/react/page/session/types'
import {
  resolveActiveViewId
} from './activeView'

const resolveQueryBarEntry = (
  document: DataDoc,
  viewId: ViewId | undefined,
  entry: QueryBarEntry | null
): QueryBarEntry | null => {
  if (!entry || !viewId) {
    return null
  }

  if (entry.kind === 'addFilter' || entry.kind === 'addSort') {
    return entry
  }

  const activeView = document.views.byId[viewId]
  if (!activeView) {
    return null
  }

  const view = activeView

  if (entry.kind === 'sort') {
    return view.sort.length
      ? { kind: 'sort' }
      : null
  }

  if (!getDocumentFieldById(document, entry.fieldId)) {
    return null
  }

  return view.filter.rules.some(rule => (
    rule.fieldId === entry.fieldId
  ))
    ? {
        kind: 'filter',
        fieldId: entry.fieldId
      }
    : null
}

export const resolveQueryBarState = (
  document: DataDoc,
  viewId: ViewId | undefined,
  queryState: QueryBarState
): QueryBarState => {
  const activeView = viewId
    ? document.views.byId[viewId]
    : undefined
  const view = activeView
  const hasEntries = Boolean(view && (view.filter.rules.length > 0 || view.sort.length > 0))
  const route = resolveQueryBarEntry(document, viewId, queryState.route)

  return {
    visible: queryState.visible && hasEntries,
    route
  }
}

export const resolveSettingsState = (
  document: DataDoc,
  viewId: ViewId | undefined,
  settings: SettingsState
): SettingsState => ({
  visible: Boolean(viewId) && settings.visible,
  route: viewId
    ? normalizeSettingsRoute(
        settings.route,
        getDocumentCustomFields(document),
        true,
        getDocumentViewById(document, viewId)?.type
      )
    : cloneSettingsRoute(settings.route)
})

export const resolvePageState = (
  document: DataDoc,
  page: PageSessionState,
  valueEditorOpen: boolean
): ResolvedPageState => {
  const viewId = resolveActiveViewId(document, page.viewId)
  const lock = valueEditorOpen
    ? 'value-editor'
    : null

  return {
    viewId,
    query: resolveQueryBarState(document, viewId, page.query),
    settings: resolveSettingsState(document, viewId, page.settings),
    valueEditorOpen,
    lock
  }
}

export const createResolvedPageStateStore = (options: {
  document: ReadStore<DataDoc>
  page: ReadStore<PageSessionState>
  valueEditorOpen: ReadStore<boolean>
}) => createDerivedStore<ResolvedPageState>({
  get: read => resolvePageState(
    read(options.document),
    read(options.page),
    read(options.valueEditorOpen)
  )
})

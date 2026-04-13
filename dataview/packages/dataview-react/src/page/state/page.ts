import type {
  DataDoc,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentCustomFields
} from '@dataview/core/document'
import {
  createDerivedStore,
  read,
  type ReadStore
} from '@shared/core'
import {
  cloneSettingsRoute,
  normalizeSettingsRoute
} from '#dataview-react/page/session/settings'
import type {
  PageState,
  PageSessionState,
  QueryBarEntry,
  QueryBarState,
  SettingsState
} from '#dataview-react/page/session/types'

const resolveQueryBarEntry = (
  document: DataDoc,
  activeViewId: ViewId | undefined,
  entry: QueryBarEntry | null
): QueryBarEntry | null => {
  if (!entry || !activeViewId) {
    return null
  }

  if (entry.kind === 'addFilter' || entry.kind === 'addSort') {
    return entry
  }

  const activeView = document.views.byId[activeViewId]
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

export const queryBarState = (
  document: DataDoc,
  activeViewId: ViewId | undefined,
  queryState: QueryBarState
): QueryBarState => {
  const activeView = activeViewId
    ? document.views.byId[activeViewId]
    : undefined
  const view = activeView
  const hasEntries = Boolean(view && (view.filter.rules.length > 0 || view.sort.length > 0))
  const route = resolveQueryBarEntry(document, activeViewId, queryState.route)

  return {
    visible: queryState.visible && hasEntries,
    route
  }
}

export const settingsState = (input: {
  document: DataDoc
  activeViewId: ViewId | undefined
  activeViewType: View['type'] | undefined
  settings: SettingsState
}): SettingsState => ({
  visible: Boolean(input.activeViewId) && input.settings.visible,
  route: input.activeViewId
    ? normalizeSettingsRoute(
        input.settings.route,
        getDocumentCustomFields(input.document),
        true,
        input.activeViewType
      )
    : cloneSettingsRoute(input.settings.route)
})

export const pageState = (input: {
  document: DataDoc
  activeViewId: ViewId | undefined
  activeViewType: View['type'] | undefined
  page: PageSessionState
  valueEditorOpen: boolean
}): PageState => {
  const lock = input.valueEditorOpen
    ? 'value-editor'
    : null

  return {
    query: queryBarState(input.document, input.activeViewId, input.page.query),
    settings: settingsState({
      document: input.document,
      activeViewId: input.activeViewId,
      activeViewType: input.activeViewType,
      settings: input.page.settings
    }),
    valueEditorOpen: input.valueEditorOpen,
    lock
  }
}

export const createPageStateStore = (options: {
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  page: ReadStore<PageSessionState>
  valueEditorOpen: ReadStore<boolean>
}) => createDerivedStore<PageState>({
  get: () => pageState({
    document: read(options.document),
    activeViewId: read(options.activeViewId),
    activeViewType: read(options.activeView)?.type,
    page: read(options.page),
    valueEditorOpen: read(options.valueEditorOpen)
  })
})

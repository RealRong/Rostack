import type {
  GroupDocument,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentPropertyById,
  getDocumentProperties,
  getDocumentViewById
} from '@dataview/core/document'
import {
  createDerivedStore,
  type ReadStore
} from '@dataview/runtime/store'
import {
  cloneSettingsRoute,
  normalizeSettingsRoute
} from '@dataview/react/page/session/settings'
import type {
  PageInteractionState,
  PageSessionState,
  QueryBarEntry,
  QueryBarState,
  ResolvedPageState,
  SettingsState
} from '@dataview/react/page/session/types'
import {
  resolveActiveViewId
} from './activeView'

const cloneInteractionState = (
  interaction: Partial<PageInteractionState> | PageInteractionState | undefined
): PageInteractionState => ({
  blockingSurfaces: interaction?.blockingSurfaces?.map(surface => ({
    ...surface
  })) ?? []
})

const resolveQueryBarEntry = (
  document: GroupDocument,
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

  const query = activeView.query

  if (entry.kind === 'sort') {
    return query.sorters.length
      ? { kind: 'sort' }
      : null
  }

  if (!getDocumentPropertyById(document, entry.propertyId)) {
    return null
  }

  return query.filter.rules.some(rule => (
    typeof rule.property === 'string'
    && rule.property === entry.propertyId
  ))
    ? {
        kind: 'filter',
        propertyId: entry.propertyId
      }
    : null
}

export const resolveQueryBarState = (
  document: GroupDocument,
  activeViewId: ViewId | undefined,
  queryState: QueryBarState
): QueryBarState => {
  const activeView = activeViewId
    ? document.views.byId[activeViewId]
    : undefined
  const query = activeView?.query
  const hasEntries = Boolean(query && (query.filter.rules.length > 0 || query.sorters.length > 0))
  const route = resolveQueryBarEntry(document, activeViewId, queryState.route)

  return {
    visible: queryState.visible && hasEntries,
    route
  }
}

export const resolveSettingsState = (
  document: GroupDocument,
  activeViewId: ViewId | undefined,
  settings: SettingsState
): SettingsState => ({
  visible: Boolean(activeViewId) && settings.visible,
  route: activeViewId
    ? normalizeSettingsRoute(
        settings.route,
        getDocumentProperties(document),
        true,
        getDocumentViewById(document, activeViewId)?.type
      )
    : cloneSettingsRoute(settings.route)
})

export const resolveInteractionState = (
  interaction: PageInteractionState
): PageInteractionState => cloneInteractionState(interaction)

export const resolvePageState = (
  document: GroupDocument,
  page: PageSessionState,
  valueEditorOpen: boolean
): ResolvedPageState => {
  const activeViewId = resolveActiveViewId(document, page.activeViewId)
  const interaction = resolveInteractionState(page.interaction)
  const lock = interaction.blockingSurfaces.length > 0
    ? 'page-surface'
    : valueEditorOpen
      ? 'value-editor'
      : null

  return {
    activeViewId,
    query: resolveQueryBarState(document, activeViewId, page.query),
    settings: resolveSettingsState(document, activeViewId, page.settings),
    interaction,
    valueEditorOpen,
    lock
  }
}

export const createResolvedPageStateStore = (options: {
  document: ReadStore<GroupDocument>
  page: ReadStore<PageSessionState>
  valueEditorOpen: ReadStore<boolean>
}) => createDerivedStore<ResolvedPageState>({
  get: read => resolvePageState(
    read(options.document),
    read(options.page),
    read(options.valueEditorOpen)
  )
})

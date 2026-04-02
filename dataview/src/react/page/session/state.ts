import type {
  GroupDocument,
  ViewId
} from '@/core/contracts'
import {
  getDocumentPropertyById,
  getDocumentProperties,
  getDocumentViewById,
  getDocumentViews
} from '@/core/document'
import {
  createDerivedStore,
  type ReadStore
} from '@/runtime/store'
import {
  ROOT_SETTINGS_ROUTE,
  cloneSettingsRoute,
  equalSettingsRoute,
  normalizeSettingsRoute
} from './settings'
import type {
  BlockingSurfaceState,
  PageInteractionState,
  PageSessionInput,
  PageSessionState,
  QueryBarEntry,
  QueryBarState,
  ResolvedPageState,
  SettingsState
} from './types'

const EMPTY_INTERACTION_STATE: PageInteractionState = {
  blockingSurfaces: []
}

export const cloneQueryBarEntry = (
  entry: QueryBarEntry | null | undefined
): QueryBarEntry | null => {
  if (!entry) {
    return null
  }

  return entry.kind === 'filter'
    ? {
        kind: 'filter',
        propertyId: entry.propertyId
      }
    : entry.kind === 'addFilter'
      ? { kind: 'addFilter' }
      : entry.kind === 'addSort'
        ? { kind: 'addSort' }
        : { kind: 'sort' }
}

const cloneSettingsState = (
  settings: Partial<SettingsState> | undefined
): SettingsState => ({
  visible: settings?.visible ?? false,
  route: cloneSettingsRoute(settings?.route ?? ROOT_SETTINGS_ROUTE)
})

const cloneInteractionState = (
  interaction: Partial<PageInteractionState> | PageInteractionState | undefined
): PageInteractionState => ({
  blockingSurfaces: interaction?.blockingSurfaces?.map(surface => ({
    ...surface
  })) ?? EMPTY_INTERACTION_STATE.blockingSurfaces
})

const equalQueryBarEntry = (
  left: QueryBarEntry | null,
  right: QueryBarEntry | null
) => {
  if (!left || !right) {
    return left === right
  }

  return left.kind === right.kind
    && (
      left.kind !== 'filter'
      || right.kind !== 'filter'
      || left.propertyId === right.propertyId
    )
}

const equalSettingsState = (
  left: SettingsState,
  right: SettingsState
) => (
  left.visible === right.visible
  && equalSettingsRoute(left.route, right.route)
)

export const equalBlockingSurface = (
  left: BlockingSurfaceState,
  right: BlockingSurfaceState
) => (
  left.id === right.id
  && left.source === right.source
  && left.backdrop === right.backdrop
  && left.dismissOnBackdropPress === right.dismissOnBackdropPress
)

const equalInteractionState = (
  left: PageInteractionState,
  right: PageInteractionState
) => (
  left.blockingSurfaces.length === right.blockingSurfaces.length
  && left.blockingSurfaces.every((surface, index) => (
    equalBlockingSurface(surface, right.blockingSurfaces[index] as BlockingSurfaceState)
  ))
)

export const equalPageSessionState = (
  left: PageSessionState,
  right: PageSessionState
) => (
  left.activeViewId === right.activeViewId
  && left.query.visible === right.query.visible
  && equalQueryBarEntry(left.query.route, right.query.route)
  && equalSettingsState(left.settings, right.settings)
  && equalInteractionState(left.interaction, right.interaction)
)

export const createDefaultPageSessionState = (
  input?: PageSessionInput
): PageSessionState => ({
  activeViewId: input?.activeViewId,
  query: {
    visible: input?.query?.visible ?? true,
    route: cloneQueryBarEntry(input?.query?.route)
  },
  settings: cloneSettingsState(input?.settings),
  interaction: cloneInteractionState(input?.interaction)
})

export const resolveActiveViewId = (
  document: GroupDocument,
  activeViewId?: ViewId
) => {
  const views = getDocumentViews(document)
  if (!activeViewId) {
    return views[0]?.id
  }

  return views.some(view => view.id === activeViewId)
    ? activeViewId
    : views[0]?.id
}

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

import type {
  CustomField,
  CustomFieldId,
  View,
  ViewFilterRuleId,
  ViewId,
  ViewSortRuleId,
  ViewType
} from '@dataview/core/contracts'
import { store } from '@shared/core'
import {
  createControllerStore
} from '@dataview/runtime/session/controller'

export type QueryBarEntry =
  | {
      kind: 'filterCreate'
    }
  | {
      kind: 'sortCreate'
    }
  | {
      kind: 'filter'
      id: ViewFilterRuleId
    }
  | {
      kind: 'sort'
      id: ViewSortRuleId
    }

export type SettingsRoute =
  | { kind: 'root', focusTarget?: 'viewName' }
  | { kind: 'layout' }
  | { kind: 'group' }
  | { kind: 'groupField' }
  | { kind: 'viewProperties' }
  | { kind: 'fieldList' }
  | { kind: 'fieldCreate' }
  | { kind: 'fieldSchema', fieldId: CustomFieldId }
  | { kind: 'filter' }
  | { kind: 'sort' }

export interface QueryBarState {
  visible: boolean
  route: QueryBarEntry | null
}

export interface SettingsState {
  visible: boolean
  route: SettingsRoute
}

export interface PageSessionInput {
  query?: Partial<QueryBarState>
  settings?: Partial<SettingsState>
}

export interface PageSessionState {
  query: QueryBarState
  settings: SettingsState
}

export interface PageSessionApi {
  query: {
    show(): void
    hide(): void
    open(route: QueryBarEntry): void
    close(): void
  }
  settings: {
    open(route?: SettingsRoute): void
    close(): void
    back(): void
    push(route: SettingsRoute): void
  }
}

export interface PageSessionController extends PageSessionApi {
  store: store.ValueStore<PageSessionState>
  dispose(): void
}

const ROOT_SETTINGS_ROUTE: SettingsRoute = { kind: 'root' }

const GROUPABLE_VIEW_TYPES = new Set<ViewType | string>(['table', 'kanban'])

export const supportsGroupSettings = (
  viewType: ViewType | string | undefined
) => GROUPABLE_VIEW_TYPES.has(viewType ?? 'table')

const cloneSettingsRoute = (
  route: SettingsRoute | null | undefined
): SettingsRoute => {
  if (!route) {
    return ROOT_SETTINGS_ROUTE
  }

  switch (route.kind) {
    case 'root':
      return route.focusTarget
        ? {
            kind: 'root',
            focusTarget: route.focusTarget
          }
        : ROOT_SETTINGS_ROUTE
    case 'fieldSchema':
      return {
        kind: 'fieldSchema',
        fieldId: route.fieldId
      }
    default:
      return route
  }
}

const equalSettingsRoute = (
  left: SettingsRoute,
  right: SettingsRoute
) => {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'fieldSchema' && right.kind === 'fieldSchema') {
    return left.fieldId === right.fieldId
  }

  if (left.kind === 'root' && right.kind === 'root') {
    return left.focusTarget === right.focusTarget
  }

  return true
}

const parentSettingsRoute = (
  route: SettingsRoute
): SettingsRoute => {
  switch (route.kind) {
    case 'fieldCreate':
    case 'fieldSchema':
      return { kind: 'fieldList' }
    case 'groupField':
      return { kind: 'group' }
    case 'layout':
    case 'group':
    case 'viewProperties':
    case 'fieldList':
    case 'filter':
    case 'sort':
    case 'root':
    default:
      return ROOT_SETTINGS_ROUTE
  }
}

const normalizeSettingsRoute = (input: {
  route: SettingsRoute
  fields: readonly CustomField[]
  hasView: boolean
  viewType?: ViewType | string
}): SettingsRoute => {
  if (!input.hasView) {
    return ROOT_SETTINGS_ROUTE
  }

  const route = input.route

  switch (route.kind) {
    case 'root':
    case 'layout':
    case 'viewProperties':
    case 'fieldList':
    case 'fieldCreate':
    case 'filter':
    case 'sort':
      return route
    case 'group':
    case 'groupField':
      return supportsGroupSettings(input.viewType)
        ? route
        : ROOT_SETTINGS_ROUTE
    case 'fieldSchema':
      return input.fields.find(field => field.id === route.fieldId)
        ? route
        : { kind: 'fieldList' }
    default:
      return parentSettingsRoute(route)
  }
}

const cloneQueryBarEntry = (
  entry: QueryBarEntry | null | undefined
): QueryBarEntry | null => {
  if (!entry) {
    return null
  }

  return entry.kind === 'filter'
    ? {
        kind: 'filter',
        id: entry.id
      }
    : entry.kind === 'sort'
      ? {
          kind: 'sort',
          id: entry.id
        }
      : entry.kind === 'filterCreate'
        ? { kind: 'filterCreate' }
        : { kind: 'sortCreate' }
}

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
      || left.id === right.id
    )
    && (
      left.kind !== 'sort'
      || right.kind !== 'sort'
      || left.id === right.id
    )
}

const createDefaultSettingsState = (
  settings: Partial<SettingsState> | undefined
): SettingsState => ({
  visible: settings?.visible ?? false,
  route: cloneSettingsRoute(settings?.route ?? ROOT_SETTINGS_ROUTE)
})

const createDefaultPageSessionState = (
  input?: PageSessionInput
): PageSessionState => ({
  query: {
    visible: input?.query?.visible ?? true,
    route: cloneQueryBarEntry(input?.query?.route)
  },
  settings: createDefaultSettingsState(input?.settings)
})

const equalPageSessionState = (
  left: PageSessionState,
  right: PageSessionState
) => (
  left.query.visible === right.query.visible
  && equalQueryBarEntry(left.query.route, right.query.route)
  && left.settings.visible === right.settings.visible
  && equalSettingsRoute(left.settings.route, right.settings.route)
)

const resolveQueryRoute = (
  activeView: View | undefined,
  route: QueryBarEntry | null
): QueryBarEntry | null => {
  if (!route || !activeView) {
    return null
  }

  if (route.kind === 'filterCreate' || route.kind === 'sortCreate') {
    return route
  }

  if (route.kind === 'sort') {
    return activeView.sort.rules.byId[route.id]
      ? { kind: 'sort', id: route.id }
      : null
  }

  const rule = activeView.filter.rules.byId[route.id]
  return rule
    ? {
        kind: 'filter',
        id: route.id
      }
    : null
}

export const resolvePageQueryBarState = (input: {
  activeView: View | undefined
  query: QueryBarState
}): QueryBarState => {
  const hasEntries = Boolean(
    input.activeView
    && (
      input.activeView.filter.rules.order.length > 0
      || input.activeView.sort.rules.order.length > 0
    )
  )

  return {
    visible: input.query.visible && hasEntries,
    route: resolveQueryRoute(input.activeView, input.query.route)
  }
}

export const resolvePageSettingsState = (input: {
  fields: readonly CustomField[]
  activeViewId: ViewId | undefined
  activeViewType: View['type'] | undefined
  settings: SettingsState
}): SettingsState => ({
  visible: Boolean(input.activeViewId) && input.settings.visible,
  route: input.activeViewId
    ? normalizeSettingsRoute({
        route: input.settings.route,
        fields: input.fields,
        hasView: true,
        viewType: input.activeViewType
      })
    : cloneSettingsRoute(input.settings.route)
})

export const createPageSessionController = (
  initial?: PageSessionInput
): PageSessionController => {
  const {
    store: stateStore
  } = createControllerStore<PageSessionState>({
    initial: createDefaultPageSessionState(initial),
    isEqual: equalPageSessionState
  })

  const api: PageSessionApi = {
    query: {
      show: () => {
        stateStore.update(prev => (
          prev.query.visible
            ? prev
            : {
                ...prev,
                query: {
                  ...prev.query,
                  visible: true
                }
              }
        ))
      },
      hide: () => {
        stateStore.update(prev => (
          prev.query.visible || prev.query.route
            ? {
                ...prev,
                query: {
                  visible: false,
                  route: null
                }
              }
            : prev
        ))
      },
      open: route => {
        stateStore.update(prev => ({
          ...prev,
          query: {
            visible: true,
            route: cloneQueryBarEntry(route)
          }
        }))
      },
      close: () => {
        stateStore.update(prev => (
          prev.query.route
            ? {
                ...prev,
                query: {
                  ...prev.query,
                  route: null
                }
              }
            : prev
        ))
      }
    },
    settings: {
      open: route => {
        stateStore.update(prev => ({
          ...prev,
          settings: {
            visible: true,
            route: cloneSettingsRoute(route ?? ROOT_SETTINGS_ROUTE)
          }
        }))
      },
      close: () => {
        stateStore.update(prev => (
          prev.settings.visible
            ? {
                ...prev,
                settings: {
                  ...prev.settings,
                  visible: false
                }
              }
            : prev
        ))
      },
      back: () => {
        stateStore.update(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            route: parentSettingsRoute(prev.settings.route)
          }
        }))
      },
      push: route => {
        stateStore.update(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            route: cloneSettingsRoute(route)
          }
        }))
      }
    }
  }

  return {
    ...api,
    store: stateStore,
    dispose: () => {}
  }
}

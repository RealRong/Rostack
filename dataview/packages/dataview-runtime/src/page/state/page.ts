import type {
  CustomField,
  FilterRule,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import {
  cloneSettingsRoute,
  normalizeSettingsRoute
} from '@dataview/runtime/page/session/settings'
import type {
  PageState,
  PageSessionState,
  QueryBarEntry,
  QueryBarState,
  SettingsState
} from '@dataview/runtime/page/session/types'

const resolveQueryBarEntry = (
  activeView: View | undefined,
  entry: QueryBarEntry | null
): QueryBarEntry | null => {
  if (!entry || !activeView) {
    return null
  }

  if (entry.kind === 'addFilter' || entry.kind === 'addSort') {
    return entry
  }

  if (entry.kind === 'sort') {
    return activeView.sort.length
      ? { kind: 'sort' }
      : null
  }

  const rule = activeView.filter.rules[entry.index] as FilterRule | undefined

  return rule
    ? {
        kind: 'filter',
        index: entry.index
      }
    : null
}

export const queryBarState = (
  activeView: View | undefined,
  queryState: QueryBarState
): QueryBarState => {
  const hasEntries = Boolean(
    activeView
    && (activeView.filter.rules.length > 0 || activeView.sort.length > 0)
  )
  const route = resolveQueryBarEntry(activeView, queryState.route)

  return {
    visible: queryState.visible && hasEntries,
    route
  }
}

export const settingsState = (input: {
  fields: readonly CustomField[]
  activeViewId: ViewId | undefined
  activeViewType: View['type'] | undefined
  settings: SettingsState
}): SettingsState => ({
  visible: Boolean(input.activeViewId) && input.settings.visible,
  route: input.activeViewId
    ? normalizeSettingsRoute(
        input.settings.route,
        input.fields,
        true,
        input.activeViewType
      )
    : cloneSettingsRoute(input.settings.route)
})

export const pageState = (input: {
  fields: readonly CustomField[]
  activeViewId: ViewId | undefined
  activeView: View | undefined
  page: PageSessionState
  valueEditorOpen: boolean
}): PageState => {
  const lock = input.valueEditorOpen
    ? 'value-editor'
    : null

  return {
    query: queryBarState(input.activeView, input.page.query),
    settings: settingsState({
      fields: input.fields,
      activeViewId: input.activeViewId,
      activeViewType: input.activeView?.type,
      settings: input.page.settings
    }),
    valueEditorOpen: input.valueEditorOpen,
    lock
  }
}

export const createPageStateStore = (options: {
  fields: store.ReadStore<readonly CustomField[]>
  activeViewId: store.ReadStore<ViewId | undefined>
  activeView: store.ReadStore<View | undefined>
  page: store.ReadStore<PageSessionState>
  valueEditorOpen: store.ReadStore<boolean>
}) => store.createDerivedStore<PageState>({
  get: () => pageState({
    fields: store.read(options.fields),
    activeViewId: store.read(options.activeViewId),
    activeView: store.read(options.activeView),
    page: store.read(options.page),
    valueEditorOpen: store.read(options.valueEditorOpen)
  }),
  isEqual: (left, right) => (
    left.lock === right.lock
    && left.valueEditorOpen === right.valueEditorOpen
    && left.query.visible === right.query.visible
    && left.query.route === right.query.route
    && left.settings.visible === right.settings.visible
    && left.settings.route === right.settings.route
  )
})

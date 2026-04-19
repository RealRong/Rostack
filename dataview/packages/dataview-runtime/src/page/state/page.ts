import type {
  CustomField,
  FilterRule,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  createDerivedStore,
  read,
  sameIdOrder,
  type ReadStore
} from '@shared/core'
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
  fields: ReadStore<readonly CustomField[]>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  page: ReadStore<PageSessionState>
  valueEditorOpen: ReadStore<boolean>
}) => createDerivedStore<PageState>({
  get: () => pageState({
    fields: read(options.fields),
    activeViewId: read(options.activeViewId),
    activeView: read(options.activeView),
    page: read(options.page),
    valueEditorOpen: read(options.valueEditorOpen)
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

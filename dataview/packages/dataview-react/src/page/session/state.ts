import {
  ROOT_SETTINGS_ROUTE,
  cloneSettingsRoute,
  equalSettingsRoute
} from '#react/page/session/settings.ts'
import type {
  PageSessionInput,
  PageSessionState,
  QueryBarEntry,
  SettingsState
} from '#react/page/session/types.ts'

export const cloneQueryBarEntry = (
  entry: QueryBarEntry | null | undefined
): QueryBarEntry | null => {
  if (!entry) {
    return null
  }

  return entry.kind === 'filter'
    ? {
        kind: 'filter',
        fieldId: entry.fieldId
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
      || left.fieldId === right.fieldId
    )
}

const equalSettingsState = (
  left: SettingsState,
  right: SettingsState
) => (
  left.visible === right.visible
  && equalSettingsRoute(left.route, right.route)
)

export const equalPageSessionState = (
  left: PageSessionState,
  right: PageSessionState
) => (
  left.query.visible === right.query.visible
  && equalQueryBarEntry(left.query.route, right.query.route)
  && equalSettingsState(left.settings, right.settings)
)

export const createDefaultPageSessionState = (
  input?: PageSessionInput
): PageSessionState => ({
  query: {
    visible: input?.query?.visible ?? true,
    route: cloneQueryBarEntry(input?.query?.route)
  },
  settings: cloneSettingsState(input?.settings)
})

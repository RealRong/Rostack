import type {
  CustomField,
  ViewType,
  CustomFieldId
} from '@dataview/core/contracts'
import type {
  SettingsRoute
} from '@dataview/runtime/page/session/types'

export const ROOT_SETTINGS_ROUTE: SettingsRoute = { kind: 'root' }

const GROUPABLE_VIEW_TYPES = new Set<ViewType | string>(['table', 'kanban'])

export const supportsGroupSettings = (
  viewType: ViewType | string | undefined
) => GROUPABLE_VIEW_TYPES.has(viewType ?? 'table')

export const cloneSettingsRoute = (
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

export const equalSettingsRoute = (
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

const findField = (
  fields: readonly CustomField[],
  fieldId: CustomFieldId
) => fields.find(field => field.id === fieldId)

export const parentSettingsRoute = (
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

export const normalizeSettingsRoute = (
  route: SettingsRoute,
  fields: readonly CustomField[],
  hasView: boolean,
  viewType?: ViewType | string
): SettingsRoute => {
  if (!hasView) {
    return ROOT_SETTINGS_ROUTE
  }

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
      return supportsGroupSettings(viewType)
        ? route
        : ROOT_SETTINGS_ROUTE
    case 'fieldSchema':
      return findField(fields, route.fieldId)
        ? route
        : { kind: 'fieldList' }
    default:
      return parentSettingsRoute(route)
  }
}

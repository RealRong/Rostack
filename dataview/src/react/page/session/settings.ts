import type {
  GroupProperty,
  GroupViewType,
  PropertyId
} from '@/core/contracts'
import type {
  SettingsRoute
} from './types'

export const ROOT_SETTINGS_ROUTE: SettingsRoute = { kind: 'root' }

const GROUP_ENABLED_VIEW_TYPES = new Set<GroupViewType | string>(['table', 'kanban'])

export const supportsGroupSettings = (
  viewType: GroupViewType | string | undefined
) => GROUP_ENABLED_VIEW_TYPES.has(viewType ?? 'table')

export const cloneSettingsRoute = (
  route: SettingsRoute | null | undefined
): SettingsRoute => {
  if (!route) {
    return ROOT_SETTINGS_ROUTE
  }

  switch (route.kind) {
    case 'propertyEdit':
      return {
        kind: 'propertyEdit',
        propertyId: route.propertyId
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

  if (left.kind === 'propertyEdit' && right.kind === 'propertyEdit') {
    return left.propertyId === right.propertyId
  }

  return true
}

const findProperty = (
  properties: readonly GroupProperty[],
  propertyId: PropertyId
) => properties.find(property => property.id === propertyId)

export const parentSettingsRoute = (
  route: SettingsRoute
): SettingsRoute => {
  switch (route.kind) {
    case 'propertyCreate':
    case 'propertyEdit':
      return { kind: 'propertyList' }
    case 'layout':
    case 'group':
    case 'viewProperties':
    case 'propertyList':
    case 'filter':
    case 'sort':
    case 'root':
    default:
      return ROOT_SETTINGS_ROUTE
  }
}

export const normalizeSettingsRoute = (
  route: SettingsRoute,
  properties: readonly GroupProperty[],
  hasView: boolean,
  viewType?: GroupViewType | string
): SettingsRoute => {
  if (!hasView) {
    return ROOT_SETTINGS_ROUTE
  }

  switch (route.kind) {
    case 'root':
    case 'layout':
    case 'viewProperties':
    case 'propertyList':
    case 'propertyCreate':
    case 'filter':
    case 'sort':
      return route
    case 'group':
      return supportsGroupSettings(viewType)
        ? route
        : ROOT_SETTINGS_ROUTE
    case 'propertyEdit':
      return findProperty(properties, route.propertyId)
        ? route
        : { kind: 'propertyList' }
    default:
      return parentSettingsRoute(route)
  }
}

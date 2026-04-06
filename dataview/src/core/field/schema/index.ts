import type {
  GroupEntityTable,
  GroupProperty,
  GroupPropertyConfig,
  GroupPropertyKind,
  PropertyId
} from '../../contracts/state'
import {
  GROUP_PROPERTY_KINDS,
  createKindConfig
} from '../kind/spec'

export const TITLE_PROPERTY_ID = 'title' as PropertyId

export const isGroupPropertyKind = (value: unknown): value is GroupPropertyKind => {
  return typeof value === 'string' && GROUP_PROPERTY_KINDS.includes(value as GroupPropertyKind)
}

export const isTitlePropertyId = (value: unknown): value is PropertyId => value === TITLE_PROPERTY_ID

export const createTitleProperty = (name = 'Title'): GroupProperty => ({
  id: TITLE_PROPERTY_ID,
  name,
  kind: 'text',
  config: defaultPropertyConfig('text')
})

export const createPropertyKey = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

export const createUniquePropertyName = (
  baseName: string,
  properties: readonly Pick<GroupProperty, 'name'>[] | readonly string[]
) => {
  const normalizedBaseName = baseName.trim()
  if (!normalizedBaseName) {
    return ''
  }

  const nameSet = new Set(
    properties
      .map(property => (
        typeof property === 'string'
          ? property
          : property.name
      ).trim())
      .filter(Boolean)
  )

  if (!nameSet.has(normalizedBaseName)) {
    return normalizedBaseName
  }

  let suffix = 1
  while (nameSet.has(`${normalizedBaseName}${suffix}`)) {
    suffix += 1
  }

  return `${normalizedBaseName}${suffix}`
}

export const defaultPropertyConfig = (kind: GroupPropertyKind): GroupPropertyConfig => {
  return createKindConfig(kind)
}

export const getPropertyConfig = (property: Pick<GroupProperty, 'kind' | 'config'>): GroupPropertyConfig => {
  if (property.config?.type === property.kind) {
    return property.config
  }

  return defaultPropertyConfig(property.kind)
}

export const normalizeGroupProperty = (property: GroupProperty): GroupProperty => {
  const kind = isTitlePropertyId(property.id)
    ? 'text'
    : property.kind
  const next: GroupProperty = {
    id: property.id,
    name: property.name,
    kind,
    config: structuredClone(
      isTitlePropertyId(property.id)
        ? defaultPropertyConfig('text')
        : getPropertyConfig({
            kind,
            config: property.config
          })
    )
  }

  if (property.meta !== undefined) {
    next.meta = structuredClone(property.meta)
  }

  return next
}

export const normalizeGroupProperties = (
  properties: GroupEntityTable<PropertyId, GroupProperty>
): GroupEntityTable<PropertyId, GroupProperty> => {
  const byId = {} as Record<PropertyId, GroupProperty>
  const order: PropertyId[] = [TITLE_PROPERTY_ID]
  const seen = new Set<PropertyId>([TITLE_PROPERTY_ID])

  byId[TITLE_PROPERTY_ID] = properties.byId[TITLE_PROPERTY_ID]
    ? normalizeGroupProperty(properties.byId[TITLE_PROPERTY_ID])
    : createTitleProperty()

  const push = (property: GroupProperty | undefined) => {
    if (!property) {
      return
    }

    const nextProperty = normalizeGroupProperty(property)
    if (seen.has(nextProperty.id)) {
      return
    }

    seen.add(nextProperty.id)
    byId[nextProperty.id] = nextProperty
    order.push(nextProperty.id)
  }

  properties.order.forEach(propertyId => {
    if (propertyId === TITLE_PROPERTY_ID) {
      return
    }

    push(properties.byId[propertyId])
  })

  Object.keys(properties.byId).forEach(propertyIdKey => {
    const propertyId = propertyIdKey as PropertyId
    if (propertyId === TITLE_PROPERTY_ID) {
      return
    }

    push(properties.byId[propertyId])
  })

  return {
    byId,
    order
  }
}

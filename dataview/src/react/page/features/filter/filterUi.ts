import type {
  PropertyId,
  GroupProperty,
  GroupFilterRule
} from '@/core/contracts'

export const getFilterPropertyId = (
  rule: Pick<GroupFilterRule, 'property'>
): PropertyId | undefined => {
  if (typeof rule.property !== 'string') {
    return undefined
  }

  return rule.property
}

const getFilterPropertyIds = (
  rules: readonly GroupFilterRule[]
): Set<PropertyId> => {
  const propertyIds = new Set<PropertyId>()

  rules.forEach(rule => {
    const propertyId = getFilterPropertyId(rule)
    if (propertyId) {
      propertyIds.add(propertyId)
    }
  })

  return propertyIds
}

export const getAvailableFilterProperties = (
  properties: readonly GroupProperty[],
  rules: readonly GroupFilterRule[]
) => {
  const usedPropertyIds = getFilterPropertyIds(rules)
  return properties.filter(property => !usedPropertyIds.has(property.id))
}

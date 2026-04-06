import type {
  GroupProperty
} from '@dataview/core/contracts'

export interface PropertyValueBehavior {
  canEdit: boolean
  canQuickToggle: boolean
  toggle?: (value: unknown) => unknown | undefined
}

const toggleCheckboxValue = (value: unknown) => value === true
  ? false
  : true

export const canQuickTogglePropertyValue = (
  property?: GroupProperty
) => property?.kind === 'checkbox'

export const resolvePropertyValueBehavior = (input: {
  exists: boolean
  property?: GroupProperty
}): PropertyValueBehavior => {
  if (!input.property) {
    return {
      canEdit: false,
      canQuickToggle: false
    }
  }

  return canQuickTogglePropertyValue(input.property)
    ? {
        canEdit: input.exists,
        canQuickToggle: input.exists,
        toggle: toggleCheckboxValue
      }
    : {
        canEdit: input.exists,
        canQuickToggle: false
      }
}

export const resolvePropertyPrimaryAction = (input: {
  exists: boolean
  property?: GroupProperty
  value: unknown
}) => {
  const behavior = resolvePropertyValueBehavior({
    exists: input.exists,
    property: input.property
  })

  if (behavior.canQuickToggle) {
    return {
      kind: 'quickToggle' as const,
      value: behavior.toggle?.(input.value)
    }
  }

  return behavior.canEdit
    ? {
        kind: 'edit' as const
      }
    : {
        kind: 'select' as const
      }
}

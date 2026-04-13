import type {
  CustomField
} from '#dataview-core/contracts'

export interface FieldValueBehavior {
  canEdit: boolean
  canQuickToggle: boolean
  toggle?: (value: unknown) => unknown | undefined
}

const toggleBooleanValue = (value: unknown) => value === true
  ? false
  : true

export const canQuickToggleCustomFieldValue = (
  field?: CustomField
) => field?.kind === 'boolean'

export const resolveCustomFieldValueBehavior = (input: {
  exists: boolean
  field?: CustomField
}): FieldValueBehavior => {
  if (!input.field) {
    return {
      canEdit: false,
      canQuickToggle: false
    }
  }

  return canQuickToggleCustomFieldValue(input.field)
    ? {
        canEdit: input.exists,
        canQuickToggle: input.exists,
        toggle: toggleBooleanValue
      }
    : {
        canEdit: input.exists,
        canQuickToggle: false
      }
}

export const resolveCustomFieldPrimaryAction = (input: {
  exists: boolean
  field?: CustomField
  value: unknown
}) => {
  const behavior = resolveCustomFieldValueBehavior({
    exists: input.exists,
    field: input.field
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

import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  EntityTable
} from '@dataview/core/contracts/state'
import { string } from '@shared/core'
import {
  createDefaultFieldOfKind,
  CUSTOM_FIELD_KINDS,
  getKindSpec,
  type FieldSchemaValidationIssue
} from '@dataview/core/field/kind/spec'

export type {
  FieldSchemaValidationIssue
} from '@dataview/core/field/kind/spec'

export const isCustomFieldKind = (
  value: unknown
): value is CustomFieldKind => (
  typeof value === 'string'
  && CUSTOM_FIELD_KINDS.includes(value as CustomFieldKind)
)

export const createFieldKey = (
  value: string
) => string.createKey(value)

export const createUniqueFieldName = (
  baseName: string,
  fields: readonly Pick<CustomField, 'name'>[] | readonly string[]
) => {
  const normalizedBaseName = baseName.trim()
  if (!normalizedBaseName) {
    return ''
  }

  const nameSet = new Set(
    fields
      .map(field => (
        typeof field === 'string'
          ? field
          : field.name
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

export const createDefaultCustomField = (input: {
  id: CustomFieldId
  name: string
  kind: CustomFieldKind
  meta?: Record<string, unknown>
}): CustomField => createDefaultFieldOfKind(input.kind, input)

export const validateCustomFieldShape = (
  field: CustomField,
  path: string
): readonly FieldSchemaValidationIssue[] => getKindSpec(field.kind).schema.validate(field, path)

export const normalizeCustomField = (
  field: CustomField
): CustomField => getKindSpec(field.kind).schema.normalize(field)

export const normalizeCustomFields = (
  fields: EntityTable<CustomFieldId, CustomField>
): EntityTable<CustomFieldId, CustomField> => {
  const byId = {} as Record<CustomFieldId, CustomField>
  const order: CustomFieldId[] = []
  const seen = new Set<CustomFieldId>()

  const push = (field: CustomField | undefined) => {
    if (!field) {
      return
    }

    const nextField = normalizeCustomField(field)
    if (seen.has(nextField.id)) {
      return
    }

    seen.add(nextField.id)
    byId[nextField.id] = nextField
    order.push(nextField.id)
  }

  fields.order.forEach(fieldId => {
    push(fields.byId[fieldId])
  })

  Object.keys(fields.byId).forEach(fieldIdKey => {
    push(fields.byId[fieldIdKey as CustomFieldId])
  })

  return {
    byId,
    order
  }
}

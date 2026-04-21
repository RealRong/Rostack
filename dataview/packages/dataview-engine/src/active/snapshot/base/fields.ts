import type {
  CustomField,
  Field,
  FieldId
} from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import type {
  FieldList
} from '@dataview/engine/contracts'
import {
  createOrderedKeyedListCollection
} from '@dataview/engine/active/snapshot/list'

export const createFieldsProjection = (input: {
  fieldIds: readonly FieldId[]
  byId: ReadonlyMap<FieldId, Field>
}): FieldList => {
  const all: Field[] = []
  const ids: FieldId[] = []
  const custom: CustomField[] = []
  const visibleById = new Map<FieldId, Field>()

  input.fieldIds.forEach(fieldId => {
    const field = input.byId.get(fieldId)
    if (!field) {
      return
    }

    all.push(field)
    ids.push(field.id)
    visibleById.set(field.id, field)
    if (fieldApi.kind.isCustom(field)) {
      custom.push(field)
    }
  })

  return {
    ...createOrderedKeyedListCollection({
      ids,
      all,
      get: id => visibleById.get(id)
    }),
    custom
  }
}

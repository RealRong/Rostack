import type {
  CustomField,
  Field,
  FieldId
} from '@dataview/core/contracts'
import { collection } from '@shared/core'
import {
  field as fieldApi
} from '@dataview/core/field'
import type {
  FieldList
} from '@dataview/engine/contracts/shared'

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

  const fields = collection.createOrderedKeyedCollection({
    ids,
    all,
    get: id => visibleById.get(id)
  })

  return {
    ...fields,
    custom
  }
}

import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import { collection } from '@shared/core'
import type {
  FieldList
} from '@dataview/engine/contracts/shared'

export const createFieldsProjection = (input: {
  fieldIds: readonly FieldId[]
  byId: ReadonlyMap<FieldId, Field>
}): FieldList => {
  const all: Field[] = []
  const ids: FieldId[] = []
  const visibleById = new Map<FieldId, Field>()

  input.fieldIds.forEach(fieldId => {
    const field = input.byId.get(fieldId)
    if (!field) {
      return
    }

    all.push(field)
    ids.push(field.id)
    visibleById.set(field.id, field)
  })

  return collection.createOrderedKeyedCollection({
    ids,
    all,
    get: id => visibleById.get(id)
  })
}

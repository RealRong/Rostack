import type {
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  FieldList
} from './types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

const emptyIds = [] as readonly FieldId[]

export const createFields = (input: {
  fieldIds: readonly FieldId[]
  byId: ReadonlyMap<FieldId, Field>
}): FieldList => {
  const all = input.fieldIds.flatMap(fieldId => {
    const field = input.byId.get(fieldId)
    return field
      ? [field]
      : []
  })
  const ids = all.map(field => field.id)
  const indexById = new Map(ids.map((id, index) => [id, index] as const))
  const visibleById = new Map(all.map(field => [field.id, field] as const))

  return {
    ids,
    all,
    get: id => visibleById.get(id),
    has: id => indexById.has(id),
    indexOf: id => indexById.get(id),
    at: index => ids[index],
    range: (anchor, focus) => {
      const anchorIndex = indexById.get(anchor)
      const focusIndex = indexById.get(focus)
      if (anchorIndex === undefined || focusIndex === undefined) {
        return emptyIds
      }

      const start = Math.min(anchorIndex, focusIndex)
      const end = Math.max(anchorIndex, focusIndex)
      return ids.slice(start, end + 1)
    }
  }
}

export const fieldsStage: Stage<FieldList> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    if (!view) {
      return undefined
    }

    return createFields({
      fieldIds: view.display.fields,
      byId: input.next.read.fieldsById()
    })
  }
}

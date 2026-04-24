import type {
  Action,
  CustomField,
  CustomFieldId,
  DataDoc,
  FieldOption
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  id as dataviewId
} from '@dataview/core/id'
import {
  field as fieldApi
} from '@dataview/core/field'
import { string } from '@shared/core'
import type {
  ActionResult
} from '@dataview/engine/contracts/result'
import type {
  FieldsApi
} from '@dataview/engine/contracts/api'

const getOptionField = (
  field?: CustomField
) => field && fieldApi.kind.hasOptions(field)
  ? field
  : undefined

const findAddedOption = (
  previous: readonly FieldOption[],
  next: readonly FieldOption[]
) => {
  const previousIds = new Set(previous.map(option => option.id))
  return next.find(option => !previousIds.has(option.id))
}

export const createFieldsApi = (options: {
  document: () => DataDoc
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): FieldsApi => {
  const dispatch = options.dispatch
  const listFields = () => documentApi.schema.fields.ids(options.document())
    .flatMap(fieldId => {
      const field = documentApi.schema.fields.get(options.document(), fieldId)
      return field ? [field] : []
    })
  const getField = (fieldId: CustomFieldId) => documentApi.schema.fields.get(options.document(), fieldId)
  const getOptionFieldById = (fieldId: CustomFieldId) => getOptionField(getField(fieldId))

  return {
    list: listFields,
    get: getField,
    create: input => {
      const name = string.trimToUndefined(input.name)
      if (!name) {
        return undefined
      }

      const fieldId = dataviewId.create('field')
      const result = dispatch({
        type: 'field.create',
        input: {
          id: fieldId,
          name,
          kind: input.kind ?? 'text'
        }
      })

      return result.applied
        ? fieldId
        : undefined
    },
    rename: (id, name) => {
      const nextName = string.trimToUndefined(name)
      if (!nextName) {
        return
      }

      dispatch({
        type: 'field.patch',
        id,
        patch: {
          name: nextName
        }
      })
    },
    patch: (id, patch) => {
      if (!Object.keys(patch).length) {
        return
      }

      dispatch({
        type: 'field.patch',
        id,
        patch
      })
    },
    replace: (id, field) => {
      dispatch({
        type: 'field.replace',
        id,
        field
      })
    },
    setKind: (id, kind) => {
      dispatch({
        type: 'field.setKind',
        id,
        kind
      })
    },
    duplicate: id => {
      const result = dispatch({
        type: 'field.duplicate',
        id
      })

      return result.created?.fields?.[0]
    },
    remove: id => dispatch({
      type: 'field.remove',
      id
    }).applied,
    options: {
      create: (id, input) => {
        const field = getOptionFieldById(id)
        if (!field) {
          return undefined
        }

        const currentOptions = fieldApi.option.read.list(field)
        const nextName = string.trimToUndefined(input?.name)
        if (nextName) {
          const existing = fieldApi.option.read.findByName(currentOptions, nextName)
          if (existing) {
            return existing
          }
        }

        const result = dispatch({
          type: 'field.option.create',
          field: id,
          ...(nextName ? { name: nextName } : {})
        })
        if (!result.applied) {
          return undefined
        }

        const nextField = getOptionFieldById(id)
        if (!nextField) {
          return undefined
        }

        return findAddedOption(currentOptions, fieldApi.option.read.list(nextField))
      },
      setOrder: (id, order) => {
        dispatch({
          type: 'field.option.setOrder',
          field: id,
          order: [...order]
        })
      },
      patch: input => {
        const field = getOptionFieldById(input.field)
        if (!field) {
          return undefined
        }

        const currentOptions = fieldApi.option.read.list(field)
        const target = currentOptions.find(option => option.id === input.option)
        if (!target) {
          return undefined
        }

        const nextName = string.trimToUndefined(input.patch.name)
        if (input.patch.name !== undefined) {
          if (!nextName) {
            return undefined
          }

          const conflicting = fieldApi.option.read.findByName(currentOptions, nextName)
          if (conflicting && conflicting.id !== input.option) {
            return undefined
          }
        }

        const result = dispatch({
          type: 'field.option.patch',
          field: input.field,
          option: input.option,
          patch: {
            ...(nextName ? { name: nextName } : {}),
            ...(input.patch.color !== undefined ? { color: input.patch.color } : {}),
            ...(input.patch.category !== undefined ? { category: input.patch.category } : {})
          }
        })
        if (!result.applied) {
          return result.issues.length
            ? undefined
            : target
        }

        const nextField = getOptionFieldById(input.field)
        return nextField
          ? fieldApi.option.read.list(nextField).find((option: FieldOption) => option.id === input.option)
          : undefined
      },
      remove: input => {
        dispatch({
          type: 'field.option.remove',
          field: input.field,
          option: input.option
        })
      }
    }
  }
}

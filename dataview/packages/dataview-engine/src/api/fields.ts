import type {
  Action,
  CustomField,
  CustomFieldId,
  FieldOption
} from '@dataview/core/contracts'
import {
  findFieldOptionByName,
  getFieldOptions,
  hasFieldOptions
} from '@dataview/core/field'
import {
  read,
  trimToUndefined
} from '@shared/core'
import { createFieldId } from '#engine/mutate/entityId.ts'
import type {
  ActionResult,
  DocumentSelectApi,
  FieldsApi
} from '#engine/contracts/public.ts'

const getOptionField = (
  field?: CustomField
) => field && hasFieldOptions(field)
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
  select: DocumentSelectApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): FieldsApi => {
  const dispatch = options.dispatch
  const listFields = () => read(options.select.fields.ids)
    .flatMap(fieldId => {
      const field = read(options.select.fields.byId, fieldId)
      return field ? [field] : []
    })
  const getField = (fieldId: CustomFieldId) => read(options.select.fields.byId, fieldId)
  const getOptionFieldById = (fieldId: CustomFieldId) => getOptionField(getField(fieldId))

  return {
    list: listFields,
    get: getField,
    create: input => {
      const name = trimToUndefined(input.name)
      if (!name) {
        return undefined
      }

      const fieldId = createFieldId()
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
    rename: (fieldId, name) => {
      const nextName = trimToUndefined(name)
      if (!nextName) {
        return
      }

      dispatch({
        type: 'field.patch',
        fieldId,
        patch: {
          name: nextName
        }
      })
    },
    update: (fieldId, patch) => {
      if (!Object.keys(patch).length) {
        return
      }

      dispatch({
        type: 'field.patch',
        fieldId,
        patch
      })
    },
    replace: (fieldId, field) => {
      dispatch({
        type: 'field.replace',
        fieldId,
        field
      })
    },
    changeType: (fieldId, input) => {
      dispatch({
        type: 'field.convert',
        fieldId,
        input
      })
    },
    duplicate: fieldId => {
      const result = dispatch({
        type: 'field.duplicate',
        fieldId
      })

      return result.created?.fields?.[0]
    },
    remove: fieldId => dispatch({
      type: 'field.remove',
      fieldId
    }).applied,
    options: {
      append: fieldId => {
        const field = getOptionFieldById(fieldId)
        if (!field) {
          return undefined
        }

        const currentOptions = getFieldOptions(field)
        const result = dispatch({
          type: 'field.option.create',
          fieldId
        })
        if (!result.applied) {
          return undefined
        }

        const nextField = getOptionFieldById(fieldId)
        if (!nextField) {
          return undefined
        }

        return findAddedOption(currentOptions, getFieldOptions(nextField))
      },
      create: (fieldId, name) => {
        const field = getOptionFieldById(fieldId)
        const nextName = trimToUndefined(name)
        if (!field || !nextName) {
          return undefined
        }

        const currentOptions = getFieldOptions(field)
        const existing = findFieldOptionByName(currentOptions, nextName)
        if (existing) {
          return existing
        }

        const result = dispatch({
          type: 'field.option.create',
          fieldId,
          input: {
            name: nextName
          }
        })
        if (!result.applied) {
          return undefined
        }

        const nextField = getOptionFieldById(fieldId)
        if (!nextField) {
          return undefined
        }

        return findAddedOption(currentOptions, getFieldOptions(nextField))
      },
      reorder: (fieldId, optionIds) => {
        dispatch({
          type: 'field.option.reorder',
          fieldId,
          optionIds: [...optionIds]
        })
      },
      update: (fieldId, optionId, patch) => {
        const field = getOptionFieldById(fieldId)
        if (!field) {
          return undefined
        }

        const currentOptions = getFieldOptions(field)
        const target = currentOptions.find(option => option.id === optionId)
        if (!target) {
          return undefined
        }

        const nextName = trimToUndefined(patch.name)
        if (patch.name !== undefined) {
          if (!nextName) {
            return undefined
          }

          const conflicting = findFieldOptionByName(currentOptions, nextName)
          if (conflicting && conflicting.id !== optionId) {
            return undefined
          }
        }

        const result = dispatch({
          type: 'field.option.update',
          fieldId,
          optionId,
          patch: {
            ...(nextName ? { name: nextName } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
            ...(patch.category !== undefined ? { category: patch.category } : {})
          }
        })
        if (!result.applied) {
          return result.issues.length
            ? undefined
            : target
        }

        const nextField = getOptionFieldById(fieldId)
        return nextField
          ? getFieldOptions(nextField).find(option => option.id === optionId)
          : undefined
      },
      remove: (fieldId, optionId) => {
        dispatch({
          type: 'field.option.remove',
          fieldId,
          optionId
        })
      }
    }
  }
}

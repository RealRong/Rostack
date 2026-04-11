import type {
  CustomFieldId,
  CustomField,
  FieldOption
} from '@dataview/core/contracts'
import {
  findFieldOptionByName,
  hasFieldOptions,
  getFieldOptions
} from '@dataview/core/field'
import { createPropertyId } from '@dataview/engine/command/entityId'
import type {
  EngineReadApi,
  FieldsEngineApi
} from '../api/public'
import type { ActionResult } from '../api/public/command'
import type { Action } from '@dataview/core/contracts'

const getOptionProperty = (
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

export const createFieldsEngineApi = (options: {
  read: EngineReadApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}): FieldsEngineApi => {
  const dispatch = options.dispatch
  const readProperties = () => options.read.customFields.get()
  const getProperty = (fieldId: CustomFieldId) => options.read.customField.get(fieldId)
  const getOptionPropertyById = (fieldId: CustomFieldId) => getOptionProperty(getProperty(fieldId))

  return {
    list: readProperties,
    get: getProperty,
    create: input => {
      const name = input.name.trim()
      if (!name) {
        return undefined
      }

      const fieldId = createPropertyId()
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
      const nextName = name.trim()
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
    replaceSchema: (fieldId, schema) => {
      dispatch({
        type: 'field.replace',
        fieldId,
        field: schema
      })
    },
    convert: (fieldId, input) => {
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
    remove: fieldId => {
      return dispatch({
        type: 'field.remove',
        fieldId
      }).applied
    },
    options: {
      append: fieldId => {
        const field = getOptionPropertyById(fieldId)
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

        const nextProperty = getOptionPropertyById(fieldId)
        if (!nextProperty) {
          return undefined
        }

        return findAddedOption(currentOptions, getFieldOptions(nextProperty))
      },
      create: (fieldId, name) => {
        const field = getOptionPropertyById(fieldId)
        const nextName = name.trim()
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

        const nextProperty = getOptionPropertyById(fieldId)
        if (!nextProperty) {
          return undefined
        }

        return findAddedOption(currentOptions, getFieldOptions(nextProperty))
      },
      reorder: (fieldId, optionIds) => {
        dispatch({
          type: 'field.option.reorder',
          fieldId,
          optionIds: [...optionIds]
        })
      },
      update: (fieldId, optionId, patch) => {
        const field = getOptionPropertyById(fieldId)
        if (!field) {
          return undefined
        }

        const currentOptions = getFieldOptions(field)
        const target = currentOptions.find(option => option.id === optionId)
        if (!target) {
          return undefined
        }

        const nextName = patch.name?.trim()
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

        const nextProperty = getOptionPropertyById(fieldId)
        return nextProperty
          ? getFieldOptions(nextProperty).find(option => option.id === optionId)
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

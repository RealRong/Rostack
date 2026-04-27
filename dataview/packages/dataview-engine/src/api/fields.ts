import type {
  CustomField,
  CustomFieldId,
  FieldOption,
} from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import { createId, string } from '@shared/core'
import type {
  Engine,
  FieldsApi
} from '@dataview/engine/contracts/api'
import type {
  ExecuteResult,
} from '@dataview/engine/types/intent'

const readId = (
  result: ExecuteResult
): string | undefined => result.ok
  && typeof result.data === 'object'
  && result.data !== null
  && 'id' in result.data
    ? String(result.data.id)
    : undefined

const getOptionField = (
  field?: CustomField
) => field && fieldApi.kind.hasOptions(field)
  ? field
  : undefined

const findAddedOption = (
  previous: readonly FieldOption[],
  next: readonly FieldOption[]
) => {
  const previousIds = new Set(previous.map((option) => option.id))
  return next.find((option) => !previousIds.has(option.id))
}

export const createFieldsApi = (
  engine: Pick<Engine, 'doc' | 'execute'>
): FieldsApi => {
  const listFields = () => engine.doc().fields.order
    .map((fieldId) => engine.doc().fields.byId[fieldId])
    .filter((field): field is CustomField => Boolean(field))
  const getField = (fieldId: CustomFieldId) => engine.doc().fields.byId[fieldId]
  const getOptionFieldById = (fieldId: CustomFieldId) => getOptionField(getField(fieldId))

  return {
    list: listFields,
    get: getField,
    create: (input) => {
      const name = string.trimToUndefined(input.name)
      if (!name) {
        return undefined
      }

      const fieldId = createId('field') as CustomFieldId
      const result = engine.execute({
        type: 'field.create',
        input: {
          id: fieldId,
          name,
          kind: input.kind ?? 'text'
        }
      })

      return readId(result)
    },
    rename: (id, name) => {
      const nextName = string.trimToUndefined(name)
      if (!nextName) {
        return
      }

      engine.execute({
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

      engine.execute({
        type: 'field.patch',
        id,
        patch
      })
    },
    replace: (id, field) => {
      engine.execute({
        type: 'field.replace',
        id,
        field
      })
    },
    setKind: (id, kind) => {
      engine.execute({
        type: 'field.setKind',
        id,
        kind
      })
    },
    duplicate: (id) => {
      const result = engine.execute({
        type: 'field.duplicate',
        id
      })

      return readId(result)
    },
    remove: (id) => engine.execute({
      type: 'field.remove',
      id
    }).ok,
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

        const result = engine.execute({
          type: 'field.option.create',
          field: id,
          ...(nextName ? { name: nextName } : {})
        })
        if (!result.ok) {
          return undefined
        }

        const nextField = getOptionFieldById(id)
        if (!nextField) {
          return undefined
        }

        return findAddedOption(currentOptions, fieldApi.option.read.list(nextField))
      },
      setOrder: (id, order) => {
        engine.execute({
          type: 'field.option.setOrder',
          field: id,
          order: [...order]
        })
      },
      patch: (input) => {
        const field = getOptionFieldById(input.field)
        if (!field) {
          return undefined
        }

        const currentOptions = fieldApi.option.read.list(field)
        const target = currentOptions.find((option) => option.id === input.option)
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

        const result = engine.execute({
          type: 'field.option.patch',
          field: input.field,
          option: input.option,
          patch: {
            ...(nextName ? { name: nextName } : {}),
            ...(input.patch.color !== undefined ? { color: input.patch.color } : {}),
            ...(input.patch.category !== undefined ? { category: input.patch.category } : {})
          }
        })
        if (!result.ok) {
          return undefined
        }

        const nextField = getOptionFieldById(input.field)
        return nextField
          ? fieldApi.option.read.list(nextField).find((option) => option.id === input.option)
          : undefined
      },
      remove: (input) => {
        engine.execute({
          type: 'field.option.remove',
          field: input.field,
          option: input.option
        })
      }
    }
  }
}

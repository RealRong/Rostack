import type {
  PropertyId,
  GroupProperty,
  GroupPropertyOption
} from '@/core/contracts'
import {
  findPropertyOptionByName,
  hasPropertyOptions,
  getPropertyOptions
} from '@/core/property'
import {
  getDocumentPropertyById,
  getDocumentProperties
} from '@/core/document'
import { createPropertyId } from '@/engine/command/entityId'
import type {
  GroupEngine,
  GroupPropertiesEngineApi
} from '../types'

const getOptionProperty = (
  property?: GroupProperty
) => property && hasPropertyOptions(property)
  ? property
  : undefined

const findAddedOption = (
  previous: readonly GroupPropertyOption[],
  next: readonly GroupPropertyOption[]
) => {
  const previousIds = new Set(previous.map(option => option.id))
  return next.find(option => !previousIds.has(option.id))
}

export const createPropertiesEngineApi = (options: {
  engine: Pick<GroupEngine, 'read' | 'command'>
}): GroupPropertiesEngineApi => {
  const dispatch = (
    command: Parameters<GroupEngine['command']>[0]
  ) => options.engine.command(command)
  const readDocument = () => options.engine.read.document.get()
  const readProperties = () => getDocumentProperties(readDocument())
  const getProperty = (propertyId: PropertyId) => options.engine.read.property.get(propertyId)
  const getOptionPropertyById = (propertyId: PropertyId) => getOptionProperty(getDocumentPropertyById(readDocument(), propertyId))

  return {
    list: readProperties,
    get: getProperty,
    create: input => {
      const name = input.name.trim()
      if (!name) {
        return undefined
      }

      const propertyId = createPropertyId()
      const result = dispatch({
        type: 'property.create',
        input: {
          id: propertyId,
          name,
          kind: input.kind ?? 'text'
        }
      })

      return result.applied
        ? propertyId
        : undefined
    },
    rename: (propertyId, name) => {
      const nextName = name.trim()
      if (!nextName) {
        return
      }

      dispatch({
        type: 'property.patch',
        propertyId: propertyId,
        patch: {
          name: nextName
        }
      })
    },
    update: (propertyId, patch) => {
      if (!Object.keys(patch).length) {
        return
      }

      dispatch({
        type: 'property.patch',
        propertyId: propertyId,
        patch
      })
    },
    convert: (propertyId, input) => {
      dispatch({
        type: 'property.convert',
        propertyId,
        input
      })
    },
    duplicate: propertyId => {
      const result = dispatch({
        type: 'property.duplicate',
        propertyId
      })

      return result.created?.properties?.[0]
    },
    remove: propertyId => {
      return dispatch({
        type: 'property.remove',
        propertyId
      }).applied
    },
    options: {
      append: propertyId => {
        const property = getOptionPropertyById(propertyId)
        if (!property) {
          return undefined
        }

        const currentOptions = getPropertyOptions(property)
        const result = dispatch({
          type: 'property.option.create',
          propertyId
        })
        if (!result.applied) {
          return undefined
        }

        const nextProperty = getOptionPropertyById(propertyId)
        if (!nextProperty) {
          return undefined
        }

        return findAddedOption(currentOptions, getPropertyOptions(nextProperty))
      },
      create: (propertyId, name) => {
        const property = getOptionPropertyById(propertyId)
        const nextName = name.trim()
        if (!property || !nextName) {
          return undefined
        }

        const currentOptions = getPropertyOptions(property)
        const existing = findPropertyOptionByName(currentOptions, nextName)
        if (existing) {
          return existing
        }

        const result = dispatch({
          type: 'property.option.create',
          propertyId,
          input: {
            name: nextName
          }
        })
        if (!result.applied) {
          return undefined
        }

        const nextProperty = getOptionPropertyById(propertyId)
        if (!nextProperty) {
          return undefined
        }

        return findAddedOption(currentOptions, getPropertyOptions(nextProperty))
      },
      reorder: (propertyId, optionIds) => {
        dispatch({
          type: 'property.option.reorder',
          propertyId,
          optionIds: [...optionIds]
        })
      },
      update: (propertyId, optionId, patch) => {
        const property = getOptionPropertyById(propertyId)
        if (!property) {
          return undefined
        }

        const currentOptions = getPropertyOptions(property)
        const target = currentOptions.find(option => option.id === optionId)
        if (!target) {
          return undefined
        }

        const nextName = patch.name?.trim()
        if (patch.name !== undefined) {
          if (!nextName) {
            return undefined
          }

          const conflicting = findPropertyOptionByName(currentOptions, nextName)
          if (conflicting && conflicting.id !== optionId) {
            return undefined
          }
        }

        const result = dispatch({
          type: 'property.option.update',
          propertyId,
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

        const nextProperty = getOptionPropertyById(propertyId)
        return nextProperty
          ? getPropertyOptions(nextProperty).find(option => option.id === optionId)
          : undefined
      },
      remove: (propertyId, optionId) => {
        dispatch({
          type: 'property.option.remove',
          propertyId,
          optionId
        })
      }
    }
  }
}

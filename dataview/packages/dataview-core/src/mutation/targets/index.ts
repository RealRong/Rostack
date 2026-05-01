import type {
  DataDoc,
  FieldId,
  FieldOption,
  FilterRule,
  RecordId,
  SortRule,
  ViewId,
} from '@dataview/core/types'
import {
  field as fieldApi,
} from '@dataview/core/field'
import {
  view as viewApi,
} from '@dataview/core/view'
import {
  entityTable,
} from '@shared/core'
import {
  draft,
} from '@shared/draft'
import {
  defineMutationRegistry,
} from '@shared/mutation/engine'
import {
  dataviewEntities
} from '@dataview/core/entities'

const readRequiredKey = (
  key: string | undefined,
  label: string
): string => {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`${label} requires a non-empty key.`)
  }

  return key
}

const setView = (
  document: DataDoc,
  viewId: ViewId,
  patch: (current: DataDoc['views']['byId'][ViewId]) => DataDoc['views']['byId'][ViewId]
): DataDoc => {
  const current = document.views.byId[viewId]
  if (!current) {
    throw new Error(`View ${viewId} not found.`)
  }

  return {
    ...document,
    views: entityTable.write.put(document.views, patch(current))
  }
}

const setOptionField = (
  document: DataDoc,
  fieldId: string,
  patch: (
    current: Extract<DataDoc['fields']['byId'][string], { kind: 'select' | 'multiSelect' | 'status' }>
  ) => Extract<DataDoc['fields']['byId'][string], { kind: 'select' | 'multiSelect' | 'status' }>
): DataDoc => {
  const current = document.fields.byId[fieldId]
  if (!fieldApi.kind.hasOptions(current)) {
    throw new Error(`Field ${fieldId} does not support options.`)
  }

  return {
    ...document,
    fields: entityTable.write.put(document.fields, patch(current))
  }
}

const viewQueryChange = (
  viewId: string,
  raw: string
) => ({
  key: 'view.query',
  change: {
    ids: [viewId],
    paths: {
      [viewId]: [raw]
    }
  }
}) as const

const viewLayoutChange = (
  viewId: string,
  raw: string
) => ({
  key: 'view.layout',
  change: {
    ids: [viewId],
    paths: {
      [viewId]: [raw]
    }
  }
}) as const

const fieldSchemaChange = (
  fieldId: string,
  raw: string
) => ({
  key: 'field.schema',
  change: {
    ids: [fieldId],
    paths: {
      [fieldId]: [raw]
    }
  }
}) as const

export const dataviewMutationRegistry = defineMutationRegistry<DataDoc>()({
  entity: dataviewEntities,
  ordered: {
    fieldOptions: {
      type: 'field.options',
      read: (document, key) => {
        const fieldId = readRequiredKey(key, 'field.options')
        const field = document.fields.byId[fieldId]
        if (!fieldApi.kind.hasOptions(field)) {
          throw new Error(`Field ${fieldId} does not support options.`)
        }

        return field.options
      },
      identify: (option: FieldOption) => option.id,
      clone: (option: FieldOption) => structuredClone(option),
      patch: (option: FieldOption, patch: Partial<Omit<FieldOption, 'id'>>) => draft.record.apply(
        option,
        patch
      ),
      diff: (before: FieldOption, after: FieldOption) => draft.record.diff(
        before,
        after
      ) as Partial<Omit<FieldOption, 'id'>>,
      write: (document, key, options) => {
        const fieldId = readRequiredKey(key, 'field.options')
        return setOptionField(
          document,
          fieldId,
          (field) => {
            if (field.kind === 'status') {
              return {
                ...field,
                options: options.map((option) => structuredClone(option)) as typeof field.options
              }
            }

            return {
              ...field,
              options: options.map((option) => structuredClone(option)) as typeof field.options
            }
          }
        )
      },
      change: (key) => {
        const fieldId = readRequiredKey(key, 'field.options')
        return [
          fieldSchemaChange(fieldId, 'options')
        ]
      }
    },
    viewOrder: {
      type: 'view.orders',
      read: (document, key) => {
        const viewId = readRequiredKey(key, 'view.orders')
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return view.orders
      },
      identify: (recordId: RecordId) => recordId,
      clone: (recordId: RecordId) => recordId,
      write: (document, key, recordIds) => {
        const viewId = readRequiredKey(key, 'view.orders')
        return setView(
          document,
          viewId,
          (view) => ({
            ...view,
            orders: [...recordIds] as RecordId[]
          })
        )
      },
      change: (key) => {
        const viewId = readRequiredKey(key, 'view.orders')
        return [
          viewQueryChange(viewId, 'orders')
        ]
      }
    },
    viewDisplay: {
      type: 'view.display.fields',
      read: (document, key) => {
        const viewId = readRequiredKey(key, 'view.display.fields')
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return view.display.fields
      },
      identify: (fieldId: FieldId) => fieldId,
      clone: (fieldId: FieldId) => fieldId,
      write: (document, key, fieldIds) => {
        const viewId = readRequiredKey(key, 'view.display.fields')
        return setView(
          document,
          viewId,
          (view) => ({
            ...view,
            display: {
              ...view.display,
              fields: [...fieldIds] as FieldId[]
            }
          })
        )
      },
      change: (key) => {
        const viewId = readRequiredKey(key, 'view.display.fields')
        return [
          viewLayoutChange(viewId, 'display.fields')
        ]
      }
    },
    viewFilter: {
      type: 'view.filter.rules',
      read: (document, key) => {
        const viewId = readRequiredKey(key, 'view.filter.rules')
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return viewApi.filter.rules.read.list(view.filter.rules)
      },
      identify: (rule: FilterRule) => rule.id,
      clone: (rule: FilterRule) => structuredClone(rule),
      patch: (rule: FilterRule, patch: Partial<Omit<FilterRule, 'id'>>) => draft.record.apply(
        rule,
        patch
      ),
      diff: (before: FilterRule, after: FilterRule) => draft.record.diff(
        before,
        after
      ) as Partial<Omit<FilterRule, 'id'>>,
      write: (document, key, rules) => {
        const viewId = readRequiredKey(key, 'view.filter.rules')
        return setView(
          document,
          viewId,
          (view) => ({
            ...view,
            filter: {
              ...view.filter,
              rules: entityTable.normalize.list(
                (rules as readonly FilterRule[]).map((rule) => structuredClone(rule))
              ) as typeof view.filter.rules
            }
          })
        )
      },
      change: (key) => {
        const viewId = readRequiredKey(key, 'view.filter.rules')
        return [
          viewQueryChange(viewId, 'filter.rules')
        ]
      }
    },
    viewSort: {
      type: 'view.sort.rules',
      read: (document, key) => {
        const viewId = readRequiredKey(key, 'view.sort.rules')
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return viewApi.sort.rules.list(view.sort.rules)
      },
      identify: (rule: SortRule) => rule.id,
      clone: (rule: SortRule) => structuredClone(rule),
      patch: (rule: SortRule, patch: Partial<Omit<SortRule, 'id'>>) => draft.record.apply(
        rule,
        patch
      ),
      diff: (before: SortRule, after: SortRule) => draft.record.diff(
        before,
        after
      ) as Partial<Omit<SortRule, 'id'>>,
      write: (document, key, rules) => {
        const viewId = readRequiredKey(key, 'view.sort.rules')
        return setView(
          document,
          viewId,
          (view) => ({
            ...view,
            sort: {
              ...view.sort,
              rules: entityTable.normalize.list(
                (rules as readonly SortRule[]).map((rule) => structuredClone(rule))
              ) as typeof view.sort.rules
            }
          })
        )
      },
      change: (key) => {
        const viewId = readRequiredKey(key, 'view.sort.rules')
        return [
          viewQueryChange(viewId, 'sort.rules')
        ]
      }
    }
  }
})

export type DataviewMutationRegistry = typeof dataviewMutationRegistry

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
  entityTable,
} from '@shared/core'
import {
  draft,
} from '@shared/draft'
import type {
  MutationStructureSource,
} from '@shared/mutation/engine'
import {
  view as viewApi,
} from '@dataview/core/view'

const FIELD_OPTIONS_STRUCTURE_PREFIX = 'field.options:'
const VIEW_ORDERS_STRUCTURE_PREFIX = 'view.orders:'
const VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX = 'view.display.fields:'
const VIEW_FILTER_RULES_STRUCTURE_PREFIX = 'view.filter.rules:'
const VIEW_SORT_RULES_STRUCTURE_PREFIX = 'view.sort.rules:'

export const fieldOptionsStructure = (
  fieldId: string
) => `${FIELD_OPTIONS_STRUCTURE_PREFIX}${fieldId}`

export const viewOrdersStructure = (
  viewId: string
) => `${VIEW_ORDERS_STRUCTURE_PREFIX}${viewId}`

export const viewDisplayFieldsStructure = (
  viewId: string
) => `${VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX}${viewId}`

export const viewFilterRulesStructure = (
  viewId: string
) => `${VIEW_FILTER_RULES_STRUCTURE_PREFIX}${viewId}`

export const viewSortRulesStructure = (
  viewId: string
) => `${VIEW_SORT_RULES_STRUCTURE_PREFIX}${viewId}`

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

export const dataviewStructures: MutationStructureSource<DataDoc> = (
  structure
) => {
  if (structure.startsWith(FIELD_OPTIONS_STRUCTURE_PREFIX)) {
    const fieldId = structure.slice(FIELD_OPTIONS_STRUCTURE_PREFIX.length)
    return {
      kind: 'ordered' as const,
      read: (document: DataDoc) => {
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
      write: (document: DataDoc, options: readonly FieldOption[]) => setOptionField(
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
      ),
      change: [
        fieldSchemaChange(fieldId, 'options')
      ]
    }
  }

  if (structure.startsWith(VIEW_ORDERS_STRUCTURE_PREFIX)) {
    const viewId = structure.slice(VIEW_ORDERS_STRUCTURE_PREFIX.length)
    return {
      kind: 'ordered' as const,
      read: (document: DataDoc) => {
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return view.orders
      },
      identify: (recordId: RecordId) => recordId,
      clone: (recordId: RecordId) => recordId,
      write: (document: DataDoc, recordIds: readonly RecordId[]) => setView(
        document,
        viewId,
        (view) => ({
          ...view,
          orders: [...recordIds]
        })
      ),
      change: [
        viewQueryChange(viewId, 'orders')
      ]
    }
  }

  if (structure.startsWith(VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX)) {
    const viewId = structure.slice(VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX.length)
    return {
      kind: 'ordered' as const,
      read: (document: DataDoc) => {
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return view.display.fields
      },
      identify: (fieldId: FieldId) => fieldId,
      clone: (fieldId: FieldId) => fieldId,
      write: (document: DataDoc, fieldIds: readonly FieldId[]) => setView(
        document,
        viewId,
        (view) => ({
          ...view,
          display: {
            ...view.display,
            fields: [...fieldIds]
          }
        })
      ),
      change: [
        viewLayoutChange(viewId, 'display.fields')
      ]
    }
  }

  if (structure.startsWith(VIEW_FILTER_RULES_STRUCTURE_PREFIX)) {
    const viewId = structure.slice(VIEW_FILTER_RULES_STRUCTURE_PREFIX.length)
    return {
      kind: 'ordered' as const,
      read: (document: DataDoc) => {
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return viewApi.filter.rules.list(view.filter.rules)
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
      write: (document: DataDoc, rules: readonly FilterRule[]) => setView(
        document,
        viewId,
        (view) => ({
          ...view,
          filter: {
            ...view.filter,
            rules: entityTable.normalize.list(rules.map((rule) => structuredClone(rule)))
          }
        })
      ),
      change: [
        viewQueryChange(viewId, 'filter.rules')
      ]
    }
  }

  if (structure.startsWith(VIEW_SORT_RULES_STRUCTURE_PREFIX)) {
    const viewId = structure.slice(VIEW_SORT_RULES_STRUCTURE_PREFIX.length)
    return {
      kind: 'ordered' as const,
      read: (document: DataDoc) => {
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
      write: (document: DataDoc, rules: readonly SortRule[]) => setView(
        document,
        viewId,
        (view) => ({
          ...view,
          sort: {
            ...view.sort,
            rules: entityTable.normalize.list(rules.map((rule) => structuredClone(rule)))
          }
        })
      ),
      change: [
        viewQueryChange(viewId, 'sort.rules')
      ]
    }
  }

  return undefined
}

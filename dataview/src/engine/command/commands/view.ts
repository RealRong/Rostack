import type {
  GroupAggregateSpec,
  GroupDocument,
  GroupFilter,
  GroupGroupBy,
  GroupSearch,
  GroupSorter,
  GroupView,
  GroupViewQuery,
  RecordId
} from '@dataview/core/contracts/state'
import type { GroupGalleryOptions } from '@dataview/core/contracts/gallery'
import type { GroupKanbanOptions } from '@dataview/core/contracts/kanban'
import type { GroupTableOptions, GroupViewDisplayOptions } from '@dataview/core/contracts/viewOptions'
import type { GroupBaseOperation } from '@dataview/core/contracts/operations'
import type { IndexedCommand } from '../context'
import {
  getDocumentProperties,
  getDocumentPropertyById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  getPropertyFilterOps,
  getPropertyGroupMeta,
  isGroupBucketSort
} from '@dataview/core/property'
import { normalizeGroupViewQuery, isSameViewQuery } from '@dataview/core/query'
import { orderedViewRecords } from '@dataview/core/view'
import { reorderRecordBlockIds } from '@dataview/core/view/order'
import { createDefaultGroupViewOptions } from '@dataview/core/view/options'
import { cloneGroupViewOptions } from '@dataview/core/view/shared'
import { createViewId } from '../entityId'
import { createIssue, hasValidationErrors, type GroupValidationIssue } from '../issues'
import {
  deriveCommand,
  hasRecord,
  isNonEmptyString,
  resolveCommandResult,
  validateBatchItems,
  validateViewExists
} from './shared'

const createDuplicateViewName = (name: string) => `${name} Copy`

const sameRecordOrder = (left: readonly RecordId[], right: readonly RecordId[]) => (
  left.length === right.length && left.every((recordId, index) => recordId === right[index])
)

const samePropertyIds = (left: readonly string[], right: readonly string[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

const sameWidths = (
  left: GroupTableOptions['widths'],
  right: GroupTableOptions['widths']
) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(key => left[key] === right[key])
}

const sameAggregates = (
  left: readonly GroupAggregateSpec[],
  right: readonly GroupAggregateSpec[]
) => JSON.stringify(left) === JSON.stringify(right)

const validatePropertyIdList = (
  document: GroupDocument,
  command: IndexedCommand,
  propertyIds: readonly unknown[],
  path: string
) => {
  const issues: GroupValidationIssue[] = []
  const seen = new Set<string>()

  propertyIds.forEach((propertyId, index) => {
    if (!isNonEmptyString(propertyId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'property id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(propertyId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Duplicate property id: ${propertyId}`, `${path}.${index}`))
      return
    }
    seen.add(propertyId)

    if (!getDocumentPropertyById(document, propertyId)) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown property: ${propertyId}`, `${path}.${index}`))
    }
  })

  return issues
}

const validateFilter = (
  document: GroupDocument,
  command: IndexedCommand,
  filter?: GroupFilter,
  path = 'filter'
) => {
  if (!filter) {
    return []
  }

  const issues: GroupValidationIssue[] = []
  if (!filter.rules.length) {
    issues.push(createIssue(command, 'warning', 'view.invalidProjection', 'Filter rules are empty', `${path}.rules`))
  }

  filter.rules.forEach((rule, index) => {
    if (!isNonEmptyString(rule.property)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Filter property must be a non-empty string', `${path}.rules.${index}.property`))
    }
    if (!isNonEmptyString(rule.op)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Filter operator must be a non-empty string', `${path}.rules.${index}.op`))
      return
    }

    const property = getDocumentPropertyById(document, rule.property)
    if (!property) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown property: ${rule.property}`, `${path}.rules.${index}.property`))
      return
    }

    if (!getPropertyFilterOps(property).includes(rule.op)) {
      issues.push(createIssue(
        command,
        'error',
        'view.invalidProjection',
        `Filter operator ${rule.op} is invalid for ${property.kind} fields`,
        `${path}.rules.${index}.op`
      ))
    }
  })

  return issues
}

const validateSearch = (
  document: GroupDocument,
  command: IndexedCommand,
  search?: GroupSearch,
  path = 'search'
) => {
  if (!search) {
    return []
  }

  const issues: GroupValidationIssue[] = []
  if (typeof search.query !== 'string') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
  }

  if (search.properties) {
    issues.push(...validatePropertyIdList(document, command, search.properties, `${path}.properties`))
  }

  return issues
}

const validateSorters = (document: GroupDocument, command: IndexedCommand, sorters?: GroupSorter[], path = 'sorters') => {
  if (!sorters) {
    return []
  }

  const issues: GroupValidationIssue[] = []
  const seen = new Set<string>()

  sorters.forEach((sorter, index) => {
    if (!isNonEmptyString(sorter.property)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Sorter property must be a non-empty string', `${path}.${index}.property`))
    } else if (!getDocumentPropertyById(document, sorter.property)) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown property: ${sorter.property}`, `${path}.${index}.property`))
    } else if (seen.has(sorter.property)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Duplicate sorter property: ${sorter.property}`, `${path}.${index}.property`))
    } else {
      seen.add(sorter.property)
    }

    if (sorter.direction !== 'asc' && sorter.direction !== 'desc') {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Sorter direction must be asc or desc', `${path}.${index}.direction`))
    }
  })

  return issues
}

const validateGroupBy = (
  document: GroupDocument,
  command: IndexedCommand,
  groupBy?: GroupGroupBy,
  path = 'query.group'
) => {
  if (!groupBy) {
    return []
  }

  const issues = isNonEmptyString(groupBy.property)
    ? []
    : [createIssue(command, 'error', 'view.invalidProjection', 'group property must be a non-empty string', `${path}.property`)]

  const property = isNonEmptyString(groupBy.property)
    ? getDocumentPropertyById(document, groupBy.property)
    : undefined
  const propertyGroupMeta = property
    ? getPropertyGroupMeta(property)
    : undefined
  const propertyGroupMetaForMode = property
    ? getPropertyGroupMeta(property, { mode: groupBy.mode })
    : undefined

  if (!property) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown property: ${groupBy.property}`, `${path}.property`))
  }

  if (!isNonEmptyString(groupBy.mode)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (property && (!propertyGroupMeta?.modes.length || !propertyGroupMeta.modes.includes(groupBy.mode))) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }

  if (!isGroupBucketSort(groupBy.bucketSort)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketSort is invalid', `${path}.bucketSort`))
  } else if (property && !propertyGroupMetaForMode?.sorts.includes(groupBy.bucketSort)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketSort is invalid for this field', `${path}.bucketSort`))
  }

  if (groupBy.bucketInterval !== undefined) {
    if (typeof groupBy.bucketInterval !== 'number'
      || !Number.isFinite(groupBy.bucketInterval)
      || groupBy.bucketInterval <= 0) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketInterval must be a positive finite number', `${path}.bucketInterval`))
    } else if (property && !propertyGroupMetaForMode?.supportsInterval) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketInterval is invalid for this field', `${path}.bucketInterval`))
    }
  }

  return issues
}

const validateDisplayOptions = (
  document: GroupDocument,
  command: IndexedCommand,
  display: GroupViewDisplayOptions,
  path: string
) => validatePropertyIdList(document, command, display.propertyIds, `${path}.propertyIds`)

const validateTableOptions = (
  document: GroupDocument,
  command: IndexedCommand,
  table: GroupTableOptions,
  path: string
) => {
  const issues: GroupValidationIssue[] = []

  Object.entries(table.widths).forEach(([propertyId, width]) => {
    if (!isNonEmptyString(propertyId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'width property id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!getDocumentPropertyById(document, propertyId)) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown property: ${propertyId}`, `${path}.widths.${propertyId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${propertyId}`))
    }
  })

  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }

  return issues
}

const validateGalleryOptions = (
  command: IndexedCommand,
  gallery: GroupGalleryOptions,
  path: string
) => {
  const issues: GroupValidationIssue[] = []

  if (typeof gallery.showPropertyLabels !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.showPropertyLabels must be boolean', `${path}.showPropertyLabels`))
  }

  if (!['sm', 'md', 'lg'].includes(gallery.cardSize)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.cardSize is invalid', `${path}.cardSize`))
  }

  return issues
}

const validateKanbanOptions = (
  command: IndexedCommand,
  kanban: GroupKanbanOptions,
  path: string
) => {
  const issues: GroupValidationIssue[] = []

  if (kanban.newRecordPosition !== 'start' && kanban.newRecordPosition !== 'end') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.newRecordPosition is invalid', `${path}.newRecordPosition`))
  }

  if (typeof kanban.fillColumnColor !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', `${path}.fillColumnColor`))
  }

  return issues
}

const validateViewOptions = (
  document: GroupDocument,
  command: IndexedCommand,
  options: GroupView['options'],
  path = 'options'
) => [
  ...validateDisplayOptions(document, command, options.display, `${path}.display`),
  ...validateTableOptions(document, command, options.table, `${path}.table`),
  ...validateGalleryOptions(command, options.gallery, `${path}.gallery`),
  ...validateKanbanOptions(command, options.kanban, `${path}.kanban`)
]

const validateOrders = (
  document: GroupDocument,
  command: IndexedCommand,
  orders: readonly RecordId[],
  path: string
) => {
  const issues: GroupValidationIssue[] = []
  const seen = new Set<RecordId>()

  orders.forEach((recordId, index) => {
    if (!isNonEmptyString(recordId)) {
      issues.push(createIssue(command, 'error', 'view.invalidOrder', 'orders must only contain non-empty record ids', `${path}.${index}`))
      return
    }
    if (seen.has(recordId)) {
      issues.push(createIssue(command, 'error', 'view.invalidOrder', `Duplicate record id: ${recordId}`, `${path}.${index}`))
      return
    }
    seen.add(recordId)

    if (!hasRecord(document, recordId)) {
      issues.push(createIssue(command, 'error', 'record.notFound', `Unknown record: ${recordId}`, `${path}.${index}`))
    }
  })

  return issues
}

const validateAggregateSpec = (command: IndexedCommand, spec: GroupAggregateSpec, path: string) => {
  const issues: GroupValidationIssue[] = []
  if (!isNonEmptyString(spec.key)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Aggregate key must be a non-empty string', `${path}.key`))
  }
  if (!['count', 'sum', 'avg', 'min', 'max'].includes(spec.op)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Aggregate operator is invalid', `${path}.op`))
  }
  if (spec.scope && spec.scope !== 'all' && spec.scope !== 'visible') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Aggregate scope is invalid', `${path}.scope`))
  }
  if (spec.property !== undefined && !isNonEmptyString(String(spec.property))) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Aggregate property must be a non-empty string', `${path}.property`))
  }
  return issues
}

const validateAggregates = (command: IndexedCommand, aggregates?: GroupAggregateSpec[], path = 'aggregates') => {
  if (!aggregates) {
    return []
  }

  const issues: GroupValidationIssue[] = []
  aggregates.forEach((spec, index) => {
    issues.push(...validateAggregateSpec(command, spec, `${path}.${index}`))
  })
  return issues
}

const validateViewQuery = (
  document: GroupDocument,
  command: IndexedCommand,
  query: GroupViewQuery,
  path = 'query'
) => [
  ...validateFilter(document, command, query.filter, `${path}.filter`),
  ...validateSearch(document, command, query.search, `${path}.search`),
  ...validateSorters(document, command, query.sorters, `${path}.sorters`),
  ...validateGroupBy(document, command, query.group, `${path}.group`)
]

const validateViewPut = (document: GroupDocument, command: Extract<IndexedCommand, { type: 'view.put' }>) => {
  const issues: GroupValidationIssue[] = []
  if (!isNonEmptyString(command.view.id)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!isNonEmptyString(command.view.name)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!isNonEmptyString(command.view.type)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View type must be a non-empty string', 'view.type'))
  }
  issues.push(
    ...validateViewQuery(document, command, command.view.query, 'view.query'),
    ...validateAggregates(command, command.view.aggregates, 'view.aggregates'),
    ...validateViewOptions(document, command, command.view.options, 'view.options'),
    ...validateOrders(document, command, command.view.orders, 'view.orders')
  )
  return issues
}

const buildViewPutOperation = (view: GroupView): GroupBaseOperation => ({
  type: 'document.view.put',
  view
})

const resolveViewUpdate = (
  document: GroupDocument,
  viewId: string,
  updater: (view: GroupView) => GroupView
) => {
  const view = getDocumentViewById(document, viewId)
  if (!view) {
    return []
  }

  const nextView = updater(view)
  return nextView === view ? [] : [buildViewPutOperation(nextView)]
}

const validateOrderMove = (document: GroupDocument, command: Extract<IndexedCommand, { type: 'view.order.move' }>) => {
  const issues = [
    ...validateBatchItems(command, command.recordIds, 'recordIds')
  ]

  const uniqueRecordIds = Array.from(new Set(command.recordIds))
  uniqueRecordIds.forEach(recordId => {
    const firstIndex = command.recordIds.indexOf(recordId)
    if (!hasRecord(document, recordId)) {
      issues.push(createIssue(command, 'error', 'record.notFound', `Unknown record: ${recordId}`, `recordIds.${firstIndex}`))
    }
  })

  if (command.beforeRecordId && !hasRecord(document, command.beforeRecordId)) {
    issues.push(createIssue(command, 'error', 'record.notFound', `Unknown record: ${command.beforeRecordId}`, 'beforeRecordId'))
  }

  const view = getDocumentViewById(document, command.viewId)
  if (view && view.query.sorters.length) {
    issues.push(createIssue(
      command,
      'error',
      'view.manualOrderUnavailable',
      'Manual reorder is unavailable while field sorters are active',
      'recordIds'
    ))
  }

  return issues
}

const validateOrderSet = (document: GroupDocument, command: Extract<IndexedCommand, { type: 'view.order.set' }>) => {
  return validateOrders(document, command, command.orders, 'orders')
}

const planOrderMove = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.order.move' }>
) => resolveViewUpdate(document, command.viewId, view => {
  const currentOrder = orderedViewRecords(document, view.id).map(record => record.id)
  const movingRecordIds = Array.from(new Set(command.recordIds))
    .filter(recordId => currentOrder.includes(recordId))

  if (!movingRecordIds.length) {
    return view
  }

  const nextOrders = reorderRecordBlockIds(currentOrder, movingRecordIds, {
    beforeRecordId: command.beforeRecordId
  })

  if (sameRecordOrder(nextOrders, currentOrder)) {
    return view
  }

  return {
    ...view,
    orders: nextOrders
  }
})

const planOrderClear = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.order.clear' }>
) => resolveViewUpdate(document, command.viewId, view => (
  view.orders.length
    ? {
        ...view,
        orders: []
      }
    : view
))

const planOrderSet = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.order.set' }>
) => resolveViewUpdate(document, command.viewId, view => {
  if (sameRecordOrder(command.orders, view.orders)) {
    return view
  }

  return {
    ...view,
    orders: [...command.orders]
  }
})

export const resolveViewPutCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.put' }>
) => {
  return resolveCommandResult(
    validateViewPut(document, command),
    [buildViewPutOperation(command.view)]
  )
}

export const resolveViewCreateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.create' }>
) => {
  const explicitViewId = command.input.id?.trim()
  const issues: GroupValidationIssue[] = []
  if (command.input.id !== undefined && !explicitViewId) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View id must be a non-empty string', 'input.id'))
  }
  if (explicitViewId && getDocumentViewById(document, explicitViewId)) {
    issues.push(createIssue(command, 'error', 'view.invalid', `View already exists: ${explicitViewId}`, 'input.id'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const view: GroupView = {
    id: explicitViewId || createViewId(),
    name: command.input.name,
    type: command.input.type,
    query: normalizeGroupViewQuery(command.input.query),
    aggregates: structuredClone(command.input.aggregates ?? []),
    options: command.input.options
      ? cloneGroupViewOptions(command.input.options)
      : createDefaultGroupViewOptions(command.input.type, getDocumentProperties(document)),
    orders: command.input.orders ? [...command.input.orders] : []
  }

  return resolveViewPutCommand(document, deriveCommand(command, 'view.put', {
    view
  }))
}

export const resolveViewDuplicateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.duplicate' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const source = getDocumentViewById(document, command.viewId)
  if (!source) {
    return resolveCommandResult(issues)
  }

  return resolveViewPutCommand(document, deriveCommand(command, 'view.put', {
    view: {
      ...structuredClone(source),
      id: createViewId(),
      name: command.name?.trim() || createDuplicateViewName(source.name)
    }
  }))
}

export const resolveViewRenameCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.rename' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!isNonEmptyString(command.name)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View name must be a non-empty string', 'name'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.name === command.name
      ? view
      : {
          ...view,
          name: command.name
        }
  )))
}

export const resolveViewTypeSetCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.type.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!isNonEmptyString(command.value)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View type must be a non-empty string', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.type === command.value
      ? view
      : {
          ...view,
          type: command.value
        }
  )))
}

export const resolveViewQuerySetCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.query.set' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateViewQuery(document, command, command.query)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    isSameViewQuery(view.query, command.query)
      ? view
      : {
          ...view,
          query: normalizeGroupViewQuery(command.query)
        }
  )))
}

export const resolveViewAggregatesSetCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.aggregates.set' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateAggregates(command, command.aggregates)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    sameAggregates(view.aggregates, command.aggregates)
      ? view
      : {
          ...view,
          aggregates: structuredClone(command.aggregates)
        }
  )))
}

export const resolveViewDisplaySetPropertyIdsCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.display.setPropertyIds' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validatePropertyIdList(document, command, command.propertyIds, 'propertyIds')
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    samePropertyIds(view.options.display.propertyIds, command.propertyIds)
      ? view
      : {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            display: {
              propertyIds: [...command.propertyIds]
            }
          }
        }
  )))
}

export const resolveViewTableSetWidthsCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.table.setWidths' }>
) => {
  const view = getDocumentViewById(document, command.viewId)
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...(view
      ? validateTableOptions(document, command, {
          ...view.options.table,
          widths: command.widths
        }, 'widths')
      : [])
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, currentView => (
    sameWidths(currentView.options.table.widths, command.widths)
      ? currentView
      : {
          ...currentView,
          options: {
            ...cloneGroupViewOptions(currentView.options),
            table: {
              ...currentView.options.table,
              widths: {
                ...command.widths
              }
            }
          }
        }
  )))
}

export const resolveViewTableSetShowVerticalLinesCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.table.setShowVerticalLines' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId)
  ]
  if (typeof command.value !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'table.showVerticalLines must be boolean', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.options.table.showVerticalLines === command.value
      ? view
      : {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            table: {
              ...view.options.table,
              showVerticalLines: command.value
            }
          }
        }
  )))
}

export const resolveViewGallerySetShowPropertyLabelsCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.gallery.setShowPropertyLabels' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.value !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.showPropertyLabels must be boolean', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.options.gallery.showPropertyLabels === command.value
      ? view
      : {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            gallery: {
              ...view.options.gallery,
              showPropertyLabels: command.value
            }
          }
        }
  )))
}

export const resolveViewGallerySetCardSizeCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.gallery.setCardSize' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!['sm', 'md', 'lg'].includes(command.value)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.cardSize is invalid', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.options.gallery.cardSize === command.value
      ? view
      : {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            gallery: {
              ...view.options.gallery,
              cardSize: command.value
            }
          }
        }
  )))
}

export const resolveViewKanbanSetNewRecordPositionCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.kanban.setNewRecordPosition' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (command.value !== 'start' && command.value !== 'end') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.newRecordPosition is invalid', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.options.kanban.newRecordPosition === command.value
      ? view
      : {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            kanban: {
              ...view.options.kanban,
              newRecordPosition: command.value
            }
          }
        }
  )))
}

export const resolveViewKanbanSetFillColumnColorCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.kanban.setFillColumnColor' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId)
  ]
  if (typeof command.value !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.options.kanban.fillColumnColor === command.value
      ? view
      : {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            kanban: {
              ...view.options.kanban,
              fillColumnColor: command.value
            }
          }
        }
  )))
}

export const resolveViewOrderMoveCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.order.move' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(
    [...issues, ...validateOrderMove(document, command)],
    planOrderMove(document, command)
  )
}

export const resolveViewOrderClearCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.order.clear' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, planOrderClear(document, command))
}

export const resolveViewOrderSetCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.order.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(
    [...issues, ...validateOrderSet(document, command)],
    planOrderSet(document, command)
  )
}

export const resolveViewRemoveCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'view.remove' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  return resolveCommandResult(issues, [
    { type: 'document.view.remove', viewId: command.viewId }
  ])
}

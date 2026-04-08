import type {
  CalculationMetric,
  DataDoc,
  Filter,
  FieldId,
  Search,
  Sorter,
  View,
  ViewCalc,
  ViewDisplay,
  RecordId,
  ViewGroup
} from '@dataview/core/contracts/state'
import type { GalleryOptions } from '@dataview/core/contracts/gallery'
import type { KanbanOptions } from '@dataview/core/contracts/kanban'
import type { TableOptions } from '@dataview/core/contracts/viewOptions'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { IndexedCommand } from '../context'
import {
  getDocumentFieldById,
  getDocumentFields,
  getDocumentViews,
  getDocumentViewById
} from '@dataview/core/document'
import {
  isCalculationMetric,
  normalizeViewCalculations,
  supportsFieldCalculationMetric
} from '@dataview/core/calculation'
import {
  getFieldFilterOps,
  getFieldGroupMeta,
  isGroupBucketSort
} from '@dataview/core/field'
import {
  addViewFilter,
  addViewSorter,
  clearViewGroup,
  clearViewSorters,
  isSameViewQuery,
  moveViewSorter,
  normalizeViewQuery,
  removeViewFilter,
  removeViewSorter,
  replaceViewSorter,
  setOnlyViewSorter,
  setViewFilter,
  setViewGroup,
  setViewGroupBucketCollapsed,
  setViewGroupBucketHidden,
  setViewGroupBucketInterval,
  setViewGroupBucketSort,
  setViewGroupMode,
  setViewGroupShowEmpty,
  setViewSearchQuery,
  setViewSorter,
  toggleViewGroup,
  toggleViewGroupBucketCollapsed,
  type ViewQuery
} from '@dataview/core/query'
import {
  createDuplicateViewPreferredName,
  orderedViewRecords,
  resolveUniqueViewName
} from '@dataview/core/view'
import { reorderRecordBlockIds } from '@dataview/core/view/order'
import { createDefaultViewDisplay, createDefaultViewOptions } from '@dataview/core/view/options'
import { cloneViewOptions } from '@dataview/core/view/shared'
import { createViewId } from '../entityId'
import { createIssue, hasValidationErrors, type ValidationIssue } from '../issues'
import {
  deriveCommand,
  hasRecord,
  isNonEmptyString,
  resolveCommandResult,
  validateBatchItems,
  validateViewExists
} from './shared'

const sameRecordOrder = (left: readonly RecordId[], right: readonly RecordId[]) => (
  left.length === right.length && left.every((recordId, index) => recordId === right[index])
)

const sameFieldIds = (left: readonly string[], right: readonly string[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

const sameWidths = (
  left: TableOptions['widths'],
  right: TableOptions['widths']
) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(key => left[key] === right[key])
}

const calculationEntries = (
  calc: ViewCalc
) => Object.entries(calc)
  .sort(([left], [right]) => left.localeCompare(right))

const sameCalc = (
  left: ViewCalc,
  right: ViewCalc
) => JSON.stringify(calculationEntries(left)) === JSON.stringify(calculationEntries(right))

const sameDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
) => sameFieldIds(left.fields, right.fields)

const toViewQuery = (
  view: View
): ViewQuery => ({
  search: view.search,
  filter: view.filter,
  sort: view.sort,
  ...(view.group ? { group: view.group } : {})
})

const applyViewQuery = (
  view: View,
  query: ViewQuery
): View => ({
  ...view,
  search: query.search,
  filter: query.filter,
  sort: query.sort,
  ...(query.group ? { group: query.group } : {})
})

const moveIds = <T,>(
  current: readonly T[],
  ids: readonly T[],
  before?: T | null
) => {
  const movingIds = Array.from(new Set(ids))
  if (!movingIds.length) {
    return [...current]
  }

  const movingIdSet = new Set(movingIds)
  const remaining = current.filter(item => !movingIdSet.has(item))
  if (before === null || before === undefined) {
    return [...remaining, ...movingIds]
  }

  const insertIndex = remaining.indexOf(before)
  if (insertIndex === -1) {
    return [...remaining, ...movingIds]
  }

  return [
    ...remaining.slice(0, insertIndex),
    ...movingIds,
    ...remaining.slice(insertIndex)
  ]
}

const validateFieldIdList = (
  document: DataDoc,
  command: IndexedCommand,
  fieldIds: readonly unknown[],
  path: string
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  fieldIds.forEach((fieldId, index) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'field id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(fieldId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Duplicate field id: ${fieldId}`, `${path}.${index}`))
      return
    }
    seen.add(fieldId)

    if (!getDocumentFieldById(document, fieldId)) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${index}`))
    }
  })

  return issues
}

const validateFilter = (
  document: DataDoc,
  command: IndexedCommand,
  filter?: Filter,
  path = 'filter'
) => {
  if (!filter) {
    return []
  }

  const issues: ValidationIssue[] = []
  filter.rules.forEach((rule, index) => {
    if (!isNonEmptyString(rule.field)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Filter field must be a non-empty string', `${path}.rules.${index}.field`))
      return
    }
    if (!isNonEmptyString(rule.op)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Filter operator must be a non-empty string', `${path}.rules.${index}.op`))
      return
    }

    const field = getDocumentFieldById(document, rule.field)
    if (!field) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${rule.field}`, `${path}.rules.${index}.field`))
      return
    }

    if (!getFieldFilterOps(field).includes(rule.op)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Filter operator ${rule.op} is invalid for ${field.kind} fields`, `${path}.rules.${index}.op`))
    }
  })

  return issues
}

const validateSearch = (
  document: DataDoc,
  command: IndexedCommand,
  search?: Search,
  path = 'search'
) => {
  if (!search) {
    return []
  }

  const issues: ValidationIssue[] = []
  if (typeof search.query !== 'string') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
  }

  if (search.fields) {
    issues.push(...validateFieldIdList(document, command, search.fields, `${path}.fields`))
  }

  return issues
}

const validateSorters = (
  document: DataDoc,
  command: IndexedCommand,
  sorters?: Sorter[],
  path = 'sort'
) => {
  if (!sorters) {
    return []
  }

  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  sorters.forEach((sorter, index) => {
    if (!isNonEmptyString(sorter.field)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Sorter field must be a non-empty string', `${path}.${index}.field`))
    } else if (!getDocumentFieldById(document, sorter.field)) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${sorter.field}`, `${path}.${index}.field`))
    } else if (seen.has(sorter.field)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Duplicate sorter field: ${sorter.field}`, `${path}.${index}.field`))
    } else {
      seen.add(sorter.field)
    }

    if (sorter.direction !== 'asc' && sorter.direction !== 'desc') {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Sorter direction must be asc or desc', `${path}.${index}.direction`))
    }
  })

  return issues
}

const validateGroup = (
  document: DataDoc,
  command: IndexedCommand,
  group?: ViewGroup,
  path = 'group'
) => {
  if (!group) {
    return []
  }

  const issues = isNonEmptyString(group.field)
    ? []
    : [createIssue(command, 'error', 'view.invalidProjection', 'group field must be a non-empty string', `${path}.field`)]

  const field = isNonEmptyString(group.field)
    ? getDocumentFieldById(document, group.field)
    : undefined
  const fieldGroupMeta = field
    ? getFieldGroupMeta(field)
    : undefined
  const fieldGroupMetaForMode = field
    ? getFieldGroupMeta(field, { mode: group.mode })
    : undefined

  if (!field) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${group.field}`, `${path}.field`))
  }

  if (!isNonEmptyString(group.mode)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (field && (!fieldGroupMeta?.modes.length || !fieldGroupMeta.modes.includes(group.mode))) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }

  if (!isGroupBucketSort(group.bucketSort)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketSort is invalid', `${path}.bucketSort`))
  } else if (field && !fieldGroupMetaForMode?.sorts.includes(group.bucketSort)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketSort is invalid for this field', `${path}.bucketSort`))
  }

  if (group.bucketInterval !== undefined) {
    if (typeof group.bucketInterval !== 'number'
      || !Number.isFinite(group.bucketInterval)
      || group.bucketInterval <= 0) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketInterval must be a positive finite number', `${path}.bucketInterval`))
    } else if (field && !fieldGroupMetaForMode?.supportsInterval) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucketInterval is invalid for this field', `${path}.bucketInterval`))
    }
  }

  return issues
}

const validateDisplay = (
  document: DataDoc,
  command: IndexedCommand,
  display?: ViewDisplay,
  path = 'display'
) => display
  ? validateFieldIdList(document, command, display.fields, `${path}.fields`)
  : []

const validateTableOptions = (
  document: DataDoc,
  command: IndexedCommand,
  table: TableOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []

  Object.entries(table.widths).forEach(([fieldId, width]) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'width field id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!getDocumentFieldById(document, fieldId)) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.widths.${fieldId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${fieldId}`))
    }
  })

  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }

  return issues
}

const validateGalleryOptions = (
  command: IndexedCommand,
  gallery: GalleryOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (typeof gallery.showFieldLabels !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.showFieldLabels must be boolean', `${path}.showFieldLabels`))
  }

  if (!['sm', 'md', 'lg'].includes(gallery.cardSize)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.cardSize is invalid', `${path}.cardSize`))
  }

  return issues
}

const validateKanbanOptions = (
  command: IndexedCommand,
  kanban: KanbanOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (kanban.newRecordPosition !== 'start' && kanban.newRecordPosition !== 'end') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.newRecordPosition is invalid', `${path}.newRecordPosition`))
  }

  if (typeof kanban.fillColumnColor !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', `${path}.fillColumnColor`))
  }

  return issues
}

const validateViewOptions = (
  document: DataDoc,
  command: IndexedCommand,
  options: View['options'],
  path = 'options'
) => [
  ...validateTableOptions(document, command, options.table, `${path}.table`),
  ...validateGalleryOptions(command, options.gallery, `${path}.gallery`),
  ...validateKanbanOptions(command, options.kanban, `${path}.kanban`)
]

const validateOrders = (
  document: DataDoc,
  command: IndexedCommand,
  orders: readonly RecordId[],
  path: string
) => {
  const issues: ValidationIssue[] = []
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

const validateCalc = (
  document: DataDoc,
  command: IndexedCommand,
  calc: ViewCalc | undefined,
  path = 'calc'
) => {
  const issues: ValidationIssue[] = []
  if (!calc) {
    return issues
  }

  Object.entries(calc).forEach(([fieldId, metric]) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Calculation field must be a non-empty string', path))
      return
    }

    const field = getDocumentFieldById(document, fieldId as FieldId)
    if (!field) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${fieldId}`))
      return
    }

    if (!isCalculationMetric(metric)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Calculation metric is invalid', `${path}.${fieldId}`))
      return
    }

    if (!supportsFieldCalculationMetric(field, metric as CalculationMetric)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Calculation metric ${metric} is invalid for ${field.kind} fields`, `${path}.${fieldId}`))
    }
  })

  return issues
}

const validateViewPut = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.put' }>
) => {
  const issues: ValidationIssue[] = []
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
    ...validateSearch(document, command, command.view.search, 'view.search'),
    ...validateFilter(document, command, command.view.filter, 'view.filter'),
    ...validateSorters(document, command, command.view.sort, 'view.sort'),
    ...validateGroup(document, command, command.view.group, 'view.group'),
    ...validateCalc(document, command, command.view.calc, 'view.calc'),
    ...validateDisplay(document, command, command.view.display, 'view.display'),
    ...validateViewOptions(document, command, command.view.options, 'view.options'),
    ...validateOrders(document, command, command.view.orders, 'view.orders')
  )

  return issues
}

const buildViewPutOperation = (view: View): BaseOperation => ({
  type: 'document.view.put',
  view
})

const resolveViewUpdate = (
  document: DataDoc,
  viewId: string,
  updater: (view: View) => View
) => {
  const view = getDocumentViewById(document, viewId)
  if (!view) {
    return []
  }

  const nextView = updater(view)
  return nextView === view ? [] : [buildViewPutOperation(nextView)]
}

const resolveViewQueryUpdate = (
  document: DataDoc,
  viewId: string,
  updater: (query: ViewQuery, view: View) => ViewQuery
) => resolveViewUpdate(document, viewId, view => {
  const currentQuery = toViewQuery(view)
  const nextQuery = updater(currentQuery, view)

  if (isSameViewQuery(currentQuery, nextQuery)) {
    return view
  }

  return applyViewQuery(view, nextQuery)
})

const validateOrderMove = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.order.move' }>
) => {
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
  if (view && view.sort.length) {
    issues.push(createIssue(command, 'error', 'view.manualOrderUnavailable', 'Manual reorder is unavailable while field sorters are active', 'recordIds'))
  }

  return issues
}

const validateOrderSet = (document: DataDoc, command: Extract<IndexedCommand, { type: 'view.order.set' }>) => {
  return validateOrders(document, command, command.orders, 'orders')
}

const planOrderMove = (
  document: DataDoc,
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
  document: DataDoc,
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
  document: DataDoc,
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

const resolveGroupField = (
  document: DataDoc,
  view: View
) => {
  const fieldId = view.group?.field
  return fieldId
    ? getDocumentFieldById(document, fieldId)
    : undefined
}

export const resolveViewPutCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.put' }>
) => resolveCommandResult(
  validateViewPut(document, command),
  [buildViewPutOperation(command.view)]
)

export const resolveViewCreateCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.create' }>
) => {
  const explicitViewId = command.input.id?.trim()
  const preferredName = command.input.name.trim()
  const issues: ValidationIssue[] = []
  if (command.input.id !== undefined && !explicitViewId) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View id must be a non-empty string', 'input.id'))
  }
  if (explicitViewId && getDocumentViewById(document, explicitViewId)) {
    issues.push(createIssue(command, 'error', 'view.invalid', `View already exists: ${explicitViewId}`, 'input.id'))
  }
  if (!preferredName) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View name must be a non-empty string', 'input.name'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const fields = getDocumentFields(document)
  const name = resolveUniqueViewName({
    views: getDocumentViews(document),
    preferredName
  })
  const query = normalizeViewQuery({
    ...(command.input.search ? { search: command.input.search } : {}),
    ...(command.input.filter ? { filter: command.input.filter } : {}),
    ...(command.input.sort ? { sort: command.input.sort } : {}),
    ...(command.input.group ? { group: command.input.group } : {})
  })
  const view: View = {
    id: explicitViewId || createViewId(),
    name,
    type: command.input.type,
    search: query.search,
    filter: query.filter,
    sort: query.sort,
    ...(query.group ? { group: query.group } : {}),
    calc: normalizeViewCalculations(command.input.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
    }),
    display: command.input.display
      ? {
          fields: [...command.input.display.fields]
        }
      : createDefaultViewDisplay(command.input.type, fields),
    options: command.input.options
      ? cloneViewOptions(command.input.options)
      : createDefaultViewOptions(command.input.type, fields),
    orders: command.input.orders ? [...command.input.orders] : []
  }

  return resolveViewPutCommand(document, deriveCommand(command, 'view.put', {
    view
  }))
}

export const resolveViewDuplicateCommand = (
  document: DataDoc,
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

  const name = resolveUniqueViewName({
    views: getDocumentViews(document),
    preferredName: command.name?.trim() || createDuplicateViewPreferredName(source.name)
  })

  return resolveViewPutCommand(document, deriveCommand(command, 'view.put', {
    view: {
      ...structuredClone(source),
      id: createViewId(),
      name
    }
  }))
}

export const resolveViewRenameCommand = (
  document: DataDoc,
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
  document: DataDoc,
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

export const resolveViewSearchSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.search.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.value !== 'string') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'search value must be a string', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    setViewSearchQuery(query, command.value)
  )))
}

export const resolveViewFilterAddCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.filter.add' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  const field = getDocumentFieldById(document, command.fieldId)
  if (!field) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    addViewFilter(query, field!)
  )))
}

export const resolveViewFilterReplaceCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.filter.replace' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateFilter(document, command, {
      mode: 'and',
      rules: [command.rule]
    }, 'rule')
  ]
  if (typeof command.index !== 'number' || !Number.isInteger(command.index) || command.index < 0) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'filter index must be a non-negative integer', 'index'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    setViewFilter(query, command.index, command.rule)
  )))
}

export const resolveViewFilterRemoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.filter.remove' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.index !== 'number' || !Number.isInteger(command.index) || command.index < 0) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'filter index must be a non-negative integer', 'index'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    removeViewFilter(query, command.index)
  )))
}

export const resolveViewFilterClearCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.filter.clear' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.filter.rules.length
      ? {
          ...view,
          filter: {
            ...view.filter,
            rules: []
          }
        }
      : view
  )))
}

export const resolveViewSortAddCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.add' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  const field = getDocumentFieldById(document, command.fieldId)
  if (!field) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (command.direction !== undefined && command.direction !== 'asc' && command.direction !== 'desc') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort direction must be asc or desc', 'direction'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    addViewSorter(query, command.fieldId, command.direction)
  )))
}

export const resolveViewSortSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!getDocumentFieldById(document, command.fieldId)) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (command.direction !== 'asc' && command.direction !== 'desc') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort direction must be asc or desc', 'direction'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    setViewSorter(query, command.fieldId, command.direction)
  )))
}

export const resolveViewSortOnlyCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.only' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!getDocumentFieldById(document, command.fieldId)) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (command.direction !== 'asc' && command.direction !== 'desc') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort direction must be asc or desc', 'direction'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    setOnlyViewSorter(query, command.fieldId, command.direction)
  )))
}

export const resolveViewSortReplaceCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.replace' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateSorters(document, command, [command.sorter], 'sorter')
  ]
  if (typeof command.index !== 'number' || !Number.isInteger(command.index) || command.index < 0) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort index must be a non-negative integer', 'index'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    replaceViewSorter(query, command.index, command.sorter)
  )))
}

export const resolveViewSortRemoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.remove' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.index !== 'number' || !Number.isInteger(command.index) || command.index < 0) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort index must be a non-negative integer', 'index'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    removeViewSorter(query, command.index)
  )))
}

export const resolveViewSortMoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.move' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.from !== 'number' || !Number.isInteger(command.from) || command.from < 0) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort from must be a non-negative integer', 'from'))
  }
  if (typeof command.to !== 'number' || !Number.isInteger(command.to) || command.to < 0) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'sort to must be a non-negative integer', 'to'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    moveViewSorter(query, command.from, command.to)
  )))
}

export const resolveViewSortClearCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.sort.clear' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    clearViewSorters(query)
  )))
}

export const resolveViewGroupSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  const field = getDocumentFieldById(document, command.fieldId)
  if (!field) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    setViewGroup(query, field!)
  )))
}

export const resolveViewGroupClearCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.clear' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    clearViewGroup(query)
  )))
}

export const resolveViewGroupToggleCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.toggle' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  const field = getDocumentFieldById(document, command.fieldId)
  if (!field) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, query => (
    toggleViewGroup(query, field!)
  )))
}

export const resolveViewGroupModeSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.mode.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!isNonEmptyString(command.value)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group mode must be a non-empty string', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupMode(query, field, command.value)
      : query
  }))
}

export const resolveViewGroupSortSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.sort.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!isGroupBucketSort(command.value)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group sort is invalid', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupBucketSort(query, field, command.value)
      : query
  }))
}

export const resolveViewGroupIntervalSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.interval.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (
    command.value !== undefined
    && (typeof command.value !== 'number' || !Number.isFinite(command.value) || command.value <= 0)
  ) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group interval must be a positive finite number', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupBucketInterval(query, field, command.value)
      : query
  }))
}

export const resolveViewGroupEmptySetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.empty.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.value !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group empty value must be boolean', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupShowEmpty(query, field, command.value)
      : query
  }))
}

const validateGroupBucketKey = (
  command: IndexedCommand,
  key: string
) => {
  const issues: ValidationIssue[] = []
  if (!isNonEmptyString(key)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'group bucket key must be a non-empty string', 'key'))
  }
  return issues
}

export const resolveViewGroupBucketShowCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.bucket.show' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateGroupBucketKey(command, command.key)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupBucketHidden(query, field, command.key, false)
      : query
  }))
}

export const resolveViewGroupBucketHideCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.bucket.hide' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateGroupBucketKey(command, command.key)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupBucketHidden(query, field, command.key, true)
      : query
  }))
}

export const resolveViewGroupBucketCollapseCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.bucket.collapse' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateGroupBucketKey(command, command.key)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupBucketCollapsed(query, field, command.key, true)
      : query
  }))
}

export const resolveViewGroupBucketExpandCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.bucket.expand' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateGroupBucketKey(command, command.key)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? setViewGroupBucketCollapsed(query, field, command.key, false)
      : query
  }))
}

export const resolveViewGroupBucketToggleCollapseCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.group.bucket.toggleCollapse' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateGroupBucketKey(command, command.key)
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewQueryUpdate(document, command.viewId, (query, view) => {
    const field = resolveGroupField(document, view)
    return field
      ? toggleViewGroupBucketCollapsed(query, field, command.key)
      : query
  }))
}

export const resolveViewCalcSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.calc.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  const field = getDocumentFieldById(document, command.fieldId)
  if (!field) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  } else if (command.metric !== null) {
    if (!isCalculationMetric(command.metric)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Calculation metric is invalid', 'metric'))
    } else if (!supportsFieldCalculationMetric(field, command.metric)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Calculation metric ${command.metric} is invalid for ${field.kind} fields`, 'metric'))
    }
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => {
    const nextCalc = { ...view.calc }
    if (command.metric === null) {
      if (!Object.prototype.hasOwnProperty.call(nextCalc, command.fieldId)) {
        return view
      }
      delete nextCalc[command.fieldId]
    } else {
      nextCalc[command.fieldId] = command.metric
    }

    return sameCalc(view.calc, nextCalc)
      ? view
      : {
          ...view,
          calc: nextCalc
        }
  }))
}

export const resolveViewDisplayReplaceCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.display.replace' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateFieldIdList(document, command, command.fieldIds, 'fieldIds')
  ]
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => {
    const nextDisplay: ViewDisplay = {
      fields: [...command.fieldIds]
    }
    return sameDisplay(view.display, nextDisplay)
      ? view
      : {
          ...view,
          display: nextDisplay
        }
  }))
}

export const resolveViewDisplayMoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.display.move' }>
) => {
  const issues = [
    ...validateViewExists(document, command, command.viewId),
    ...validateFieldIdList(document, command, command.fieldIds, 'fieldIds')
  ]
  if (command.beforeFieldId !== undefined && command.beforeFieldId !== null && !getDocumentFieldById(document, command.beforeFieldId)) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.beforeFieldId}`, 'beforeFieldId'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => {
    const nextFields = moveIds(view.display.fields, command.fieldIds, command.beforeFieldId)
    return sameFieldIds(view.display.fields, nextFields)
      ? view
      : {
          ...view,
          display: {
            fields: nextFields
          }
        }
  }))
}

export const resolveViewDisplayShowCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.display.show' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!getDocumentFieldById(document, command.fieldId)) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (command.beforeFieldId !== undefined && command.beforeFieldId !== null && !getDocumentFieldById(document, command.beforeFieldId)) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.beforeFieldId}`, 'beforeFieldId'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => {
    const currentFields = view.display.fields.includes(command.fieldId)
      ? view.display.fields
      : [...view.display.fields, command.fieldId]
    const nextFields = moveIds(currentFields, [command.fieldId], command.beforeFieldId)
    return sameFieldIds(view.display.fields, nextFields)
      ? view
      : {
          ...view,
          display: {
            fields: nextFields
          }
        }
  }))
}

export const resolveViewDisplayHideCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.display.hide' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (!getDocumentFieldById(document, command.fieldId)) {
    issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${command.fieldId}`, 'fieldId'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => {
    const nextFields = view.display.fields.filter(fieldId => fieldId !== command.fieldId)
    return sameFieldIds(view.display.fields, nextFields)
      ? view
      : {
          ...view,
          display: {
            fields: nextFields
          }
        }
  }))
}

export const resolveViewDisplayClearCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.display.clear' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.display.fields.length
      ? {
          ...view,
          display: {
            fields: []
          }
        }
      : view
  )))
}

export const resolveViewTableSetWidthsCommand = (
  document: DataDoc,
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
            ...cloneViewOptions(currentView.options),
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

export const resolveViewTableVerticalLinesSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.table.verticalLines.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
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
            ...cloneViewOptions(view.options),
            table: {
              ...view.options.table,
              showVerticalLines: command.value
            }
          }
        }
  )))
}

export const resolveViewGalleryLabelsSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.gallery.labels.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (typeof command.value !== 'boolean') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'gallery.showFieldLabels must be boolean', 'value'))
  }
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, resolveViewUpdate(document, command.viewId, view => (
    view.options.gallery.showFieldLabels === command.value
      ? view
      : {
          ...view,
          options: {
            ...cloneViewOptions(view.options),
            gallery: {
              ...view.options.gallery,
              showFieldLabels: command.value
            }
          }
        }
  )))
}

export const resolveViewGallerySetCardSizeCommand = (
  document: DataDoc,
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
            ...cloneViewOptions(view.options),
            gallery: {
              ...view.options.gallery,
              cardSize: command.value
            }
          }
        }
  )))
}

export const resolveViewKanbanSetNewRecordPositionCommand = (
  document: DataDoc,
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
            ...cloneViewOptions(view.options),
            kanban: {
              ...view.options.kanban,
              newRecordPosition: command.value
            }
          }
        }
  )))
}

export const resolveViewKanbanFillColorSetCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.kanban.fillColor.set' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
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
            ...cloneViewOptions(view.options),
            kanban: {
              ...view.options.kanban,
              fillColumnColor: command.value
            }
          }
        }
  )))
}

export const resolveViewOrderMoveCommand = (
  document: DataDoc,
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
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.order.clear' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }
  return resolveCommandResult(issues, planOrderClear(document, command))
}

export const resolveViewOrderSetCommand = (
  document: DataDoc,
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
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.remove' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  return resolveCommandResult(issues, [
    { type: 'document.view.remove', viewId: command.viewId }
  ])
}

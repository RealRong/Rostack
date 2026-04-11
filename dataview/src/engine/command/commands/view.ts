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
  ViewGroup
} from '@dataview/core/contracts/state'
import type { GalleryOptions } from '@dataview/core/contracts/gallery'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanOptions
} from '@dataview/core/contracts/kanban'
import type { TableOptions } from '@dataview/core/contracts/viewOptions'
import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { IndexedCommand } from '../context'
import {
  getDocumentActiveViewId,
  getDocumentFieldById,
  getDocumentFields,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'
import {
  isCalculationMetric,
  normalizeViewCalculations,
  supportsFieldCalculationMetric
} from '@dataview/core/calculation'
import {
  getFieldGroupMeta,
  isGroupBucketSort
} from '@dataview/core/field'
import {
  hasFilterPreset
} from '@dataview/core/filter'
import {
  resolveUniqueViewName
} from '@dataview/core/view'
import {
  normalizeViewQuery
} from '@dataview/core/query'
import {
  createDefaultViewDisplay,
  createDefaultViewOptions
} from '@dataview/core/view/options'
import {
  cloneViewOptions
} from '@dataview/core/view/shared'
import { createViewId } from '../entityId'
import { createIssue, type ValidationIssue } from '../issues'
import {
  hasRecord,
  isNonEmptyString,
  resolveCommandResult,
  validateViewExists
} from './shared'

const sameRecordOrder = (
  left: readonly string[],
  right: readonly string[]
) => left.length === right.length
  && left.every((recordId, index) => recordId === right[index])

const sameFieldIds = (
  left: readonly string[],
  right: readonly string[]
) => left.length === right.length
  && left.every((fieldId, index) => fieldId === right[index])

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

const sameSearch = (
  left: Search,
  right: Search
) => (
  left.query === right.query
  && sameFieldIds(left.fields ?? [], right.fields ?? [])
)

const sameFilterRule = (
  left: Filter['rules'][number],
  right: Filter['rules'][number]
) => JSON.stringify(left) === JSON.stringify(right)

const sameFilter = (
  left: Filter,
  right: Filter
) => (
  left.mode === right.mode
  && left.rules.length === right.rules.length
  && left.rules.every((rule, index) => sameFilterRule(rule, right.rules[index]!))
)

const sameSorters = (
  left: readonly Sorter[],
  right: readonly Sorter[]
) => (
  left.length === right.length
  && left.every((sorter, index) => (
    sorter.field === right[index]?.field
    && sorter.direction === right[index]?.direction
  ))
)

const sameGroup = (
  left: ViewGroup | undefined,
  right: ViewGroup | undefined
) => JSON.stringify(left) === JSON.stringify(right)

const sameViewOptions = (
  left: View['options'],
  right: View['options']
) => (
  sameWidths(left.table.widths, right.table.widths)
  && left.table.showVerticalLines === right.table.showVerticalLines
  && left.gallery.showFieldLabels === right.gallery.showFieldLabels
  && left.gallery.cardSize === right.gallery.cardSize
  && left.kanban.newRecordPosition === right.kanban.newRecordPosition
  && left.kanban.fillColumnColor === right.kanban.fillColumnColor
  && left.kanban.cardsPerColumn === right.kanban.cardsPerColumn
)

const cloneSearch = (
  search: Search
): Search => ({
  query: search.query,
  ...(search.fields ? { fields: [...search.fields] } : {})
})

const cloneFilter = (
  filter: Filter
): Filter => structuredClone(filter)

const cloneSorters = (
  sorters: readonly Sorter[]
): Sorter[] => sorters.map(sorter => ({ ...sorter }))

const cloneGroup = (
  group: ViewGroup
): ViewGroup => structuredClone(group)

const cloneCalc = (
  calc: ViewCalc
): ViewCalc => structuredClone(calc)

const cloneDisplay = (
  display: ViewDisplay
): ViewDisplay => ({
  fields: [...display.fields]
})

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

const validateSearch = (
  document: DataDoc,
  command: IndexedCommand,
  search: Search,
  path = 'view.search'
) => {
  const issues: ValidationIssue[] = []
  if (typeof search.query !== 'string') {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
  }

  if (search.fields) {
    issues.push(...validateFieldIdList(document, command, search.fields, `${path}.fields`))
  }

  return issues
}

const validateFilter = (
  document: DataDoc,
  command: IndexedCommand,
  filter: Filter,
  path = 'view.filter'
) => {
  const issues: ValidationIssue[] = []
  filter.rules.forEach((rule, index) => {
    if (!isNonEmptyString(rule.fieldId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Filter field id must be a non-empty string', `${path}.rules.${index}.fieldId`))
      return
    }
    if (!isNonEmptyString(rule.presetId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', 'Filter preset id must be a non-empty string', `${path}.rules.${index}.presetId`))
      return
    }

    const field = getDocumentFieldById(document, rule.fieldId)
    if (!field) {
      issues.push(createIssue(command, 'error', 'field.notFound', `Unknown field: ${rule.fieldId}`, `${path}.rules.${index}.fieldId`))
      return
    }

    if (!hasFilterPreset(field, rule.presetId)) {
      issues.push(createIssue(command, 'error', 'view.invalidProjection', `Filter preset ${rule.presetId} is invalid for ${field.kind} fields`, `${path}.rules.${index}.presetId`))
    }
  })

  return issues
}

const validateSorters = (
  document: DataDoc,
  command: IndexedCommand,
  sorters: readonly Sorter[],
  path = 'view.sort'
) => {
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
  group: ViewGroup | undefined,
  path = 'view.group'
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
    if (
      typeof group.bucketInterval !== 'number'
      || !Number.isFinite(group.bucketInterval)
      || group.bucketInterval <= 0
    ) {
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
  display: ViewDisplay,
  path = 'view.display'
) => validateFieldIdList(document, command, display.fields, `${path}.fields`)

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

  if (!KANBAN_CARDS_PER_COLUMN_OPTIONS.includes(kanban.cardsPerColumn)) {
    issues.push(createIssue(command, 'error', 'view.invalidProjection', 'kanban.cardsPerColumn is invalid', `${path}.cardsPerColumn`))
  }

  return issues
}

const validateViewOptions = (
  document: DataDoc,
  command: IndexedCommand,
  options: View['options'],
  path = 'view.options'
) => [
  ...validateTableOptions(document, command, options.table, `${path}.table`),
  ...validateGalleryOptions(command, options.gallery, `${path}.gallery`),
  ...validateKanbanOptions(command, options.kanban, `${path}.kanban`)
]

const validateOrders = (
  document: DataDoc,
  command: IndexedCommand,
  orders: readonly string[],
  path = 'view.orders'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

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
  calc: ViewCalc,
  path = 'view.calc'
) => {
  const issues: ValidationIssue[] = []

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

const validateView = (
  document: DataDoc,
  command: IndexedCommand,
  view: View
) => {
  const issues: ValidationIssue[] = []
  if (!isNonEmptyString(view.id)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!isNonEmptyString(view.name)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!isNonEmptyString(view.type)) {
    issues.push(createIssue(command, 'error', 'view.invalid', 'View type must be a non-empty string', 'view.type'))
  }

  issues.push(
    ...validateSearch(document, command, view.search),
    ...validateFilter(document, command, view.filter),
    ...validateSorters(document, command, view.sort),
    ...validateGroup(document, command, view.group),
    ...validateCalc(document, command, view.calc),
    ...validateDisplay(document, command, view.display),
    ...validateViewOptions(document, command, view.options),
    ...validateOrders(document, command, view.orders)
  )

  return issues
}

const buildViewPutOperation = (
  view: View
): BaseOperation => ({
  type: 'document.view.put',
  view
})

const applyViewPatch = (
  view: View,
  patch: Extract<IndexedCommand, { type: 'view.patch' }>['patch']
): View => {
  let next = view

  const ensureMutable = () => {
    if (next === view) {
      next = {
        ...view
      }
    }

    return next
  }

  if (patch.name !== undefined && patch.name !== view.name) {
    ensureMutable().name = patch.name
  }

  if (patch.type !== undefined && patch.type !== view.type) {
    ensureMutable().type = patch.type
  }

  if (patch.search !== undefined && !sameSearch(view.search, patch.search)) {
    ensureMutable().search = cloneSearch(patch.search)
  }

  if (patch.filter !== undefined && !sameFilter(view.filter, patch.filter)) {
    ensureMutable().filter = cloneFilter(patch.filter)
  }

  if (patch.sort !== undefined && !sameSorters(view.sort, patch.sort)) {
    ensureMutable().sort = cloneSorters(patch.sort)
  }

  if (patch.group !== undefined) {
    const nextGroup = patch.group === null
      ? undefined
      : patch.group

    if (!sameGroup(view.group, nextGroup)) {
      const nextView = ensureMutable()
      if (nextGroup) {
        nextView.group = cloneGroup(nextGroup)
      } else {
        delete (nextView as View & { group?: ViewGroup }).group
      }
    }
  }

  if (patch.calc !== undefined && !sameCalc(view.calc, patch.calc)) {
    ensureMutable().calc = cloneCalc(patch.calc)
  }

  if (patch.display !== undefined && !sameDisplay(view.display, patch.display)) {
    ensureMutable().display = cloneDisplay(patch.display)
  }

  if (patch.options !== undefined && !sameViewOptions(view.options, patch.options)) {
    ensureMutable().options = cloneViewOptions(patch.options)
  }

  if (patch.orders !== undefined && !sameRecordOrder(view.orders, patch.orders)) {
    ensureMutable().orders = [...patch.orders]
  }

  return next
}

export const resolveViewPutCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.put' }>
) => resolveCommandResult(
  validateView(document, command, command.view),
  [buildViewPutOperation(command.view)]
)

export const resolveViewPatchCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.patch' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)
  if (issues.length) {
    return resolveCommandResult(issues)
  }

  const view = getDocumentViewById(document, command.viewId)
  if (!view) {
    return resolveCommandResult(issues)
  }

  const nextView = applyViewPatch(view, command.patch)
  if (nextView === view) {
    return resolveCommandResult(issues)
  }

  return resolveCommandResult(
    [...issues, ...validateView(document, command, nextView)],
    [buildViewPutOperation(nextView)]
  )
}

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
  if (issues.length) {
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
      ? cloneDisplay(command.input.display)
      : createDefaultViewDisplay(command.input.type, fields),
    options: command.input.options
      ? cloneViewOptions(command.input.options)
      : createDefaultViewOptions(command.input.type, fields),
    orders: command.input.orders ? [...command.input.orders] : []
  }

  return resolveCommandResult(
    [...issues, ...validateView(document, command, view)],
    [buildViewPutOperation(view)]
  )
}

export const resolveViewOpenCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.open' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)

  return resolveCommandResult(
    issues,
    getDocumentActiveViewId(document) === command.viewId
      ? []
      : [{
          type: 'document.activeView.set',
          viewId: command.viewId
        }]
  )
}

export const resolveViewRemoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'view.remove' }>
) => {
  const issues = validateViewExists(document, command, command.viewId)

  return resolveCommandResult(issues, [
    {
      type: 'document.view.remove',
      viewId: command.viewId
    }
  ])
}

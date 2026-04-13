import type {
  Action,
  DataDoc,
  FieldId,
  Filter,
  Search,
  Sorter,
  View,
  ViewCalc,
  ViewDisplay,
  ViewGroup
} from '@dataview/core/contracts'
import type { GalleryOptions } from '@dataview/core/contracts/gallery'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanOptions
} from '@dataview/core/contracts/kanban'
import type { TableOptions } from '@dataview/core/contracts/viewOptions'
import {
  hasDocumentField,
  getDocumentFieldById,
  getDocumentFields,
  getDocumentRecordById,
  getDocumentViewById,
  getDocumentViews
} from '@dataview/core/document'
import {
  isCalculationMetric,
  normalizeViewCalculations,
  supportsFieldCalculationMetric
} from '@dataview/core/calculation'
import { getFieldGroupMeta, isGroupBucketSort } from '@dataview/core/field'
import {
  cloneFilter,
  hasFilterPreset,
  normalizeFilter,
  sameFilter
} from '@dataview/core/filter'
import {
  cloneGroup,
  normalizeGroup,
  sameGroup
} from '@dataview/core/group'
import {
  cloneSearch,
  normalizeSearch,
  sameSearch
} from '@dataview/core/search'
import {
  cloneSorters,
  normalizeSorters,
  sameSorters
} from '@dataview/core/sort'
import {
  cloneDisplay,
  cloneViewCalc,
  cloneViewOptions,
  normalizeViewDisplay,
  resolveUniqueViewName,
  sameDisplay,
  sameViewCalc,
  sameViewOptions
} from '@dataview/core/view'
import {
  createDefaultViewDisplay,
  createDefaultViewOptions
} from '@dataview/core/view/options'
import {
  isNonEmptyString,
  sameJsonValue,
  sameOrder,
  trimToUndefined
} from '@shared/core'
import { createViewId } from '#engine/mutate/entityId.ts'
import {
  createIssue,
  hasValidationErrors,
  type IssueSource,
  type ValidationIssue
} from '#engine/mutate/issues.ts'
import { validateViewExists } from '#engine/mutate/validate/entity.ts'
import {
  planResult,
  sourceOf,
  toViewPut,
  type PlannedActionResult
} from '#engine/mutate/planner/shared.ts'

const sameRecordOrder = sameOrder<string>

const validateFieldIdList = (
  document: DataDoc,
  source: IssueSource,
  fieldIds: readonly unknown[],
  path: string
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  fieldIds.forEach((fieldId, index) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'field id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Duplicate field id: ${fieldId}`, `${path}.${index}`))
      return
    }
    seen.add(fieldId)
    if (!hasDocumentField(document, fieldId)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${index}`))
    }
  })

  return issues
}

const validateSearch = (
  document: DataDoc,
  source: IssueSource,
  search: Search,
  path = 'view.search'
) => {
  const issues: ValidationIssue[] = []
  if (typeof search.query !== 'string') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
  }
  if (search.fields) {
    issues.push(...validateFieldIdList(document, source, search.fields, `${path}.fields`))
  }
  return issues
}

const validateFilter = (
  document: DataDoc,
  source: IssueSource,
  filter: Filter,
  path = 'view.filter'
) => {
  const issues: ValidationIssue[] = []
  filter.rules.forEach((rule, index) => {
    if (!isNonEmptyString(rule.fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Filter field id must be a non-empty string', `${path}.rules.${index}.fieldId`))
      return
    }
    if (!isNonEmptyString(rule.presetId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Filter preset id must be a non-empty string', `${path}.rules.${index}.presetId`))
      return
    }
    const field = getDocumentFieldById(document, rule.fieldId)
    if (!field) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${rule.fieldId}`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!hasFilterPreset(field, rule.presetId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Filter preset ${rule.presetId} is invalid for ${field.kind} fields`, `${path}.rules.${index}.presetId`))
    }
  })
  return issues
}

const validateSorters = (
  document: DataDoc,
  source: IssueSource,
  sorters: readonly Sorter[],
  path = 'view.sort'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  sorters.forEach((sorter, index) => {
    if (!isNonEmptyString(sorter.field)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Sorter field must be a non-empty string', `${path}.${index}.field`))
    } else if (!hasDocumentField(document, sorter.field)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${sorter.field}`, `${path}.${index}.field`))
    } else if (seen.has(sorter.field)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Duplicate sorter field: ${sorter.field}`, `${path}.${index}.field`))
    } else {
      seen.add(sorter.field)
    }

    if (sorter.direction !== 'asc' && sorter.direction !== 'desc') {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Sorter direction must be asc or desc', `${path}.${index}.direction`))
    }
  })
  return issues
}

const validateGroup = (
  document: DataDoc,
  source: IssueSource,
  group: ViewGroup | undefined,
  path = 'view.group'
) => {
  if (!group) {
    return []
  }

  const issues = isNonEmptyString(group.field)
    ? []
    : [createIssue(source, 'error', 'view.invalidProjection', 'group field must be a non-empty string', `${path}.field`)]

  const field = isNonEmptyString(group.field)
    ? getDocumentFieldById(document, group.field)
    : undefined
  const fieldGroupMeta = field ? getFieldGroupMeta(field) : undefined
  const fieldGroupMetaForMode = field ? getFieldGroupMeta(field, { mode: group.mode }) : undefined

  if (!field) {
    issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${group.field}`, `${path}.field`))
  }
  if (!isNonEmptyString(group.mode)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (field && (!fieldGroupMeta?.modes.length || !fieldGroupMeta.modes.includes(group.mode))) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }
  if (!isGroupBucketSort(group.bucketSort)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketSort is invalid', `${path}.bucketSort`))
  } else if (field && !fieldGroupMetaForMode?.sorts.includes(group.bucketSort)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketSort is invalid for this field', `${path}.bucketSort`))
  }
  if (group.bucketInterval !== undefined) {
    if (typeof group.bucketInterval !== 'number' || !Number.isFinite(group.bucketInterval) || group.bucketInterval <= 0) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketInterval must be a positive finite number', `${path}.bucketInterval`))
    } else if (field && !fieldGroupMetaForMode?.supportsInterval) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketInterval is invalid for this field', `${path}.bucketInterval`))
    }
  }
  return issues
}

const validateDisplay = (
  document: DataDoc,
  source: IssueSource,
  display: ViewDisplay,
  path = 'view.display'
) => validateFieldIdList(document, source, display.fields, `${path}.fields`)

const validateTableOptions = (
  document: DataDoc,
  source: IssueSource,
  table: TableOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  Object.entries(table.widths).forEach(([fieldId, width]) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'width field id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!hasDocumentField(document, fieldId)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.widths.${fieldId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${fieldId}`))
    }
  })
  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }
  return issues
}

const validateGalleryOptions = (
  source: IssueSource,
  gallery: GalleryOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  if (typeof gallery.showFieldLabels !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.showFieldLabels must be boolean', `${path}.showFieldLabels`))
  }
  if (!['sm', 'md', 'lg'].includes(gallery.cardSize)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.cardSize is invalid', `${path}.cardSize`))
  }
  return issues
}

const validateKanbanOptions = (
  source: IssueSource,
  kanban: KanbanOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  if (kanban.newRecordPosition !== 'start' && kanban.newRecordPosition !== 'end') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.newRecordPosition is invalid', `${path}.newRecordPosition`))
  }
  if (typeof kanban.fillColumnColor !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', `${path}.fillColumnColor`))
  }
  if (!KANBAN_CARDS_PER_COLUMN_OPTIONS.includes(kanban.cardsPerColumn)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.cardsPerColumn is invalid', `${path}.cardsPerColumn`))
  }
  return issues
}

const validateViewOptions = (
  document: DataDoc,
  source: IssueSource,
  options: View['options'],
  path = 'view.options'
) => [
  ...validateTableOptions(document, source, options.table, `${path}.table`),
  ...validateGalleryOptions(source, options.gallery, `${path}.gallery`),
  ...validateKanbanOptions(source, options.kanban, `${path}.kanban`)
]

const validateOrders = (
  document: DataDoc,
  source: IssueSource,
  orders: readonly string[],
  path = 'view.orders'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  orders.forEach((recordId, index) => {
    if (!isNonEmptyString(recordId)) {
      issues.push(createIssue(source, 'error', 'view.invalidOrder', 'orders must only contain non-empty record ids', `${path}.${index}`))
      return
    }
    if (seen.has(recordId)) {
      issues.push(createIssue(source, 'error', 'view.invalidOrder', `Duplicate record id: ${recordId}`, `${path}.${index}`))
      return
    }
    seen.add(recordId)
    if (!getDocumentRecordById(document, recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `${path}.${index}`))
    }
  })
  return issues
}

const validateCalc = (
  document: DataDoc,
  source: IssueSource,
  calc: ViewCalc,
  path = 'view.calc'
) => {
  const issues: ValidationIssue[] = []
  Object.entries(calc).forEach(([fieldId, metric]) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Calculation field must be a non-empty string', path))
      return
    }
    const field = getDocumentFieldById(document, fieldId as FieldId)
    if (!field) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${fieldId}`))
      return
    }
    if (!isCalculationMetric(metric)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Calculation metric is invalid', `${path}.${fieldId}`))
      return
    }
    if (!supportsFieldCalculationMetric(field, metric)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Calculation metric ${metric} is invalid for ${field.kind} fields`, `${path}.${fieldId}`))
    }
  })
  return issues
}

const validateView = (
  document: DataDoc,
  source: IssueSource,
  view: View
) => {
  const issues: ValidationIssue[] = []
  if (!isNonEmptyString(view.id)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!isNonEmptyString(view.name)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!isNonEmptyString(view.type)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View type must be a non-empty string', 'view.type'))
  }

  issues.push(
    ...validateSearch(document, source, view.search),
    ...validateFilter(document, source, view.filter),
    ...validateSorters(document, source, view.sort),
    ...validateGroup(document, source, view.group),
    ...validateCalc(document, source, view.calc),
    ...validateDisplay(document, source, view.display),
    ...validateViewOptions(document, source, view.options),
    ...validateOrders(document, source, view.orders)
  )

  return issues
}

const applyViewPatch = (
  view: View,
  patch: Extract<Action, { type: 'view.patch' }>['patch']
): View => {
  let next = view
  const ensureMutable = () => {
    if (next === view) {
      next = { ...view }
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
    const nextGroup = patch.group === null ? undefined : patch.group
    if (!sameGroup(view.group, nextGroup)) {
      const nextView = ensureMutable()
      if (nextGroup) {
        nextView.group = cloneGroup(nextGroup)
      } else {
        delete (nextView as View & { group?: ViewGroup }).group
      }
    }
  }
  if (patch.calc !== undefined && !sameViewCalc(view.calc, patch.calc)) {
    ensureMutable().calc = cloneViewCalc(patch.calc)
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

const normalizeView = (
  document: DataDoc,
  view: View
): View => {
  const fields = getDocumentFields(document)
  const group = normalizeGroup(view.group)

  return {
    ...view,
    search: normalizeSearch(view.search),
    filter: normalizeFilter(view.filter),
    sort: normalizeSorters(view.sort),
    ...(group ? { group } : {}),
    ...(!group ? { group: undefined } : {}),
    calc: normalizeViewCalculations(view.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
    }),
    display: normalizeViewDisplay(view.display),
    options: cloneViewOptions(view.options),
    orders: [...view.orders]
  }
}

const lowerViewCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.create' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const explicitViewId = trimToUndefined(action.input.id)
  const preferredName = trimToUndefined(action.input.name) ?? ''
  const issues: ValidationIssue[] = []

  if (action.input.id !== undefined && !explicitViewId) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View id must be a non-empty string', 'input.id'))
  }
  if (explicitViewId && getDocumentViewById(document, explicitViewId)) {
    issues.push(createIssue(source, 'error', 'view.invalid', `View already exists: ${explicitViewId}`, 'input.id'))
  }
  if (!preferredName) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View name must be a non-empty string', 'input.name'))
  }
  if (hasValidationErrors(issues)) {
    return planResult(issues)
  }

  const fields = getDocumentFields(document)
  const view = normalizeView(document, {
    id: explicitViewId || createViewId(),
    name: resolveUniqueViewName({
      views: getDocumentViews(document),
      preferredName
    }),
    type: action.input.type,
    search: action.input.search ?? { query: '' },
    filter: action.input.filter ?? { mode: 'and', rules: [] },
    sort: action.input.sort ?? [],
    ...(action.input.group ? { group: action.input.group } : {}),
    calc: action.input.calc ?? {},
    display: action.input.display
      ? cloneDisplay(action.input.display)
      : createDefaultViewDisplay(action.input.type, fields),
    options: action.input.options
      ? cloneViewOptions(action.input.options)
      : createDefaultViewOptions(action.input.type, fields),
    orders: action.input.orders ? [...action.input.orders] : []
  } satisfies View)

  issues.push(...validateView(document, source, view))
  return planResult(issues, [toViewPut(view)])
}

const lowerViewPatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.patch' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateViewExists(document, source, action.viewId)
  const view = getDocumentViewById(document, action.viewId)
  if (!view || hasValidationErrors(issues)) {
    return planResult(issues)
  }

  const nextView = normalizeView(document, applyViewPatch(view, action.patch))
  if (sameJsonValue(nextView, view)) {
    return planResult(issues)
  }

  issues.push(...validateView(document, source, nextView))
  return planResult(issues, [toViewPut(nextView)])
}

const lowerViewOpen = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.open' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateViewExists(document, source, action.viewId)
  return planResult(
    issues,
    getDocumentViewById(document, action.viewId)
      ? [{
          type: 'document.activeView.set',
          viewId: action.viewId
        }]
      : []
  )
}

const lowerViewRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.remove' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateViewExists(document, source, action.viewId)
  return planResult(issues, [{
    type: 'document.view.remove',
    viewId: action.viewId
  }])
}

export const planViewAction = (
  document: DataDoc,
  action: Action,
  index: number
): PlannedActionResult => {
  switch (action.type) {
    case 'view.create':
      return lowerViewCreate(document, action, index)
    case 'view.patch':
      return lowerViewPatch(document, action, index)
    case 'view.open':
      return lowerViewOpen(document, action, index)
    case 'view.remove':
      return lowerViewRemove(document, action, index)
    default:
      throw new Error(`Unsupported view planner action: ${action.type}`)
  }
}

import type {
  Action,
  FieldId,
  Filter,
  Search,
  Sorter,
  View,
  ViewCalc,
  ViewDisplay,
  ViewGroup
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type { GalleryOptions } from '@dataview/core/contracts/gallery'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanOptions
} from '@dataview/core/contracts/kanban'
import type { TableOptions } from '@dataview/core/contracts/viewOptions'
import {
  calculation
} from '@dataview/core/calculation'
import { field as fieldApi } from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  group,
} from '@dataview/core/group'
import {
  search as searchApi
} from '@dataview/core/search'
import {
  sort as sortApi
} from '@dataview/core/sort'
import {
  view as viewApi
} from '@dataview/core/view'
import { equal, string } from '@shared/core'
import { createViewId } from '@dataview/engine/mutate/entityId'
import {
  createIssue,
  hasValidationErrors,
  type IssueSource,
  type ValidationIssue
} from '@dataview/engine/mutate/issues'
import {
  type PlannedActionResult,
  type PlannerScope
} from '@dataview/engine/mutate/planner/scope'
import type { DocumentReader } from '@dataview/engine/document/reader'

const sameRecordOrder = equal.sameOrder<string>

const toViewPut = (
  view: View
): DocumentOperation => ({
  type: 'document.view.put',
  view
})

const validateFieldIdList = (
  reader: DocumentReader,
  source: IssueSource,
  fieldIds: readonly unknown[],
  path: string
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  fieldIds.forEach((fieldId, index) => {
    if (!string.isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'field id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Duplicate field id: ${fieldId}`, `${path}.${index}`))
      return
    }
    seen.add(fieldId)
    if (!reader.fields.has(fieldId)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${index}`))
    }
  })

  return issues
}

const validateSearch = (
  reader: DocumentReader,
  source: IssueSource,
  search: Search,
  path = 'view.search'
) => {
  const issues: ValidationIssue[] = []
  if (typeof search.query !== 'string') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
  }
  if (search.fields) {
    issues.push(...validateFieldIdList(reader, source, search.fields, `${path}.fields`))
  }
  return issues
}

const validateFilter = (
  reader: DocumentReader,
  source: IssueSource,
  filter: Filter,
  path = 'view.filter'
) => {
  const issues: ValidationIssue[] = []
  filter.rules.forEach((rule, index) => {
    if (!string.isNonEmptyString(rule.fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Filter field id must be a non-empty string', `${path}.rules.${index}.fieldId`))
      return
    }
    if (!string.isNonEmptyString(rule.presetId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Filter preset id must be a non-empty string', `${path}.rules.${index}.presetId`))
      return
    }
    const field = reader.fields.get(rule.fieldId)
    if (!field) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${rule.fieldId}`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!filterApi.rule.hasPreset(field, rule.presetId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Filter preset ${rule.presetId} is invalid for ${field.kind} fields`, `${path}.rules.${index}.presetId`))
    }
  })
  return issues
}

const validateSorters = (
  reader: DocumentReader,
  source: IssueSource,
  sorters: readonly Sorter[],
  path = 'view.sort'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  sorters.forEach((sorter, index) => {
    if (!string.isNonEmptyString(sorter.field)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Sorter field must be a non-empty string', `${path}.${index}.field`))
    } else if (!reader.fields.has(sorter.field)) {
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
  reader: DocumentReader,
  source: IssueSource,
  group: ViewGroup | undefined,
  path = 'view.group'
) => {
  if (!group) {
    return []
  }

  const issues = string.isNonEmptyString(group.field)
    ? []
    : [createIssue(source, 'error', 'view.invalidProjection', 'group field must be a non-empty string', `${path}.field`)]

  const field = string.isNonEmptyString(group.field)
    ? reader.fields.get(group.field)
    : undefined
  const fieldGroupMeta = field ? fieldApi.group.meta(field) : undefined
  const fieldGroupMetaForMode = field ? fieldApi.group.meta(field, { mode: group.mode }) : undefined

  if (!field) {
    issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${group.field}`, `${path}.field`))
  }
  if (!string.isNonEmptyString(group.mode)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (field && (!fieldGroupMeta?.modes.length || !fieldGroupMeta.modes.includes(group.mode))) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }
  if (!fieldApi.group.sort.isBucket(group.bucketSort)) {
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
  reader: DocumentReader,
  source: IssueSource,
  display: ViewDisplay,
  path = 'view.display'
) => validateFieldIdList(reader, source, display.fields, `${path}.fields`)

const validateTableOptions = (
  reader: DocumentReader,
  source: IssueSource,
  table: TableOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  Object.entries(table.widths).forEach(([fieldId, width]) => {
    if (!string.isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'width field id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!reader.fields.has(fieldId)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.widths.${fieldId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${fieldId}`))
    }
  })
  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }
  if (typeof table.wrap !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'table.wrap must be boolean', `${path}.wrap`))
  }
  return issues
}

const validateGalleryOptions = (
  source: IssueSource,
  gallery: GalleryOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  if (typeof gallery.card.wrap !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.card.wrap must be boolean', `${path}.card.wrap`))
  }
  if (!['sm', 'md', 'lg'].includes(gallery.card.size)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.card.size is invalid', `${path}.card.size`))
  }
  if (gallery.card.layout !== 'compact' && gallery.card.layout !== 'stacked') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.card.layout is invalid', `${path}.card.layout`))
  }
  return issues
}

const validateKanbanOptions = (
  source: IssueSource,
  kanban: KanbanOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  if (typeof kanban.card.wrap !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.card.wrap must be boolean', `${path}.card.wrap`))
  }
  if (!['sm', 'md', 'lg'].includes(kanban.card.size)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.card.size is invalid', `${path}.card.size`))
  }
  if (kanban.card.layout !== 'compact' && kanban.card.layout !== 'stacked') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.card.layout is invalid', `${path}.card.layout`))
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
  reader: DocumentReader,
  source: IssueSource,
  options: View['options'],
  path = 'view.options'
) => [
  ...validateTableOptions(reader, source, options.table, `${path}.table`),
  ...validateGalleryOptions(source, options.gallery, `${path}.gallery`),
  ...validateKanbanOptions(source, options.kanban, `${path}.kanban`)
]

const validateOrders = (
  reader: DocumentReader,
  source: IssueSource,
  orders: readonly string[],
  path = 'view.orders'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  orders.forEach((recordId, index) => {
    if (!string.isNonEmptyString(recordId)) {
      issues.push(createIssue(source, 'error', 'view.invalidOrder', 'orders must only contain non-empty record ids', `${path}.${index}`))
      return
    }
    if (seen.has(recordId)) {
      issues.push(createIssue(source, 'error', 'view.invalidOrder', `Duplicate record id: ${recordId}`, `${path}.${index}`))
      return
    }
    seen.add(recordId)
    if (!reader.records.has(recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `${path}.${index}`))
    }
  })
  return issues
}

const validateCalc = (
  reader: DocumentReader,
  source: IssueSource,
  calc: ViewCalc,
  path = 'view.calc'
) => {
  const issues: ValidationIssue[] = []
  Object.entries(calc).forEach(([fieldId, metric]) => {
    if (!string.isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Calculation field must be a non-empty string', path))
      return
    }
    const field = reader.fields.get(fieldId as FieldId)
    if (!field) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${fieldId}`))
      return
    }
    if (!calculation.metric.is(metric)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Calculation metric is invalid', `${path}.${fieldId}`))
      return
    }
    if (!calculation.metric.supports(field, metric)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Calculation metric ${metric} is invalid for ${field.kind} fields`, `${path}.${fieldId}`))
    }
  })
  return issues
}

const validateView = (
  reader: DocumentReader,
  source: IssueSource,
  view: View
) => {
  const issues: ValidationIssue[] = []
  if (!string.isNonEmptyString(view.id)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!string.isNonEmptyString(view.name)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!string.isNonEmptyString(view.type)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View type must be a non-empty string', 'view.type'))
  }

  issues.push(
    ...validateSearch(reader, source, view.search),
    ...validateFilter(reader, source, view.filter),
    ...validateSorters(reader, source, view.sort),
    ...validateGroup(reader, source, view.group),
    ...validateCalc(reader, source, view.calc),
    ...validateDisplay(reader, source, view.display),
    ...validateViewOptions(reader, source, view.options),
    ...validateOrders(reader, source, view.orders)
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
  if (patch.search !== undefined && !searchApi.state.same(view.search, patch.search)) {
    ensureMutable().search = searchApi.state.clone(patch.search)
  }
  if (patch.filter !== undefined && !filterApi.state.same(view.filter, patch.filter)) {
    ensureMutable().filter = filterApi.state.clone(patch.filter)
  }
  if (patch.sort !== undefined && !sortApi.rules.same(view.sort, patch.sort)) {
    ensureMutable().sort = sortApi.rules.clone(patch.sort)
  }
  if (patch.group !== undefined) {
    const nextGroup = patch.group === null ? undefined : patch.group
    if (!group.state.same(view.group, nextGroup)) {
      const nextView = ensureMutable()
      if (nextGroup) {
        nextView.group = group.state.clone(nextGroup)
      } else {
        delete (nextView as View & { group?: ViewGroup }).group
      }
    }
  }
  if (patch.calc !== undefined && !viewApi.calc.same(view.calc, patch.calc)) {
    ensureMutable().calc = viewApi.calc.clone(patch.calc)
  }
  if (patch.display !== undefined && !viewApi.display.same(view.display, patch.display)) {
    ensureMutable().display = viewApi.display.clone(patch.display)
  }
  if (patch.options !== undefined && !viewApi.options.same(view.options, patch.options)) {
    ensureMutable().options = viewApi.options.clone(patch.options)
  }
  if (patch.orders !== undefined && !sameRecordOrder(view.orders, patch.orders)) {
    ensureMutable().orders = [...patch.orders]
  }
  return next
}

const normalizeView = (
  reader: DocumentReader,
  view: View
): View => {
  const fields = reader.fields.list()
  const nextGroup = group.state.normalize(view.group)

  return {
    ...view,
    search: searchApi.state.normalize(view.search),
    filter: filterApi.state.normalize(view.filter),
    sort: sortApi.rules.normalize(view.sort),
    ...(nextGroup ? { group: nextGroup } : {}),
    ...(!nextGroup ? { group: undefined } : {}),
    calc: calculation.view.normalize(view.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
    }),
    display: viewApi.display.normalize(view.display),
    options: viewApi.options.normalize(view.options, {
      type: view.type,
      fields
    }),
    orders: [...view.orders]
  }
}

const resolveDefaultKanbanGroup = (
  reader: DocumentReader
): ViewGroup | undefined => {
  const fields = reader.fields.list()
  const isGroupable = (field: (typeof fields)[number]) => (
    field.kind !== 'title'
    && fieldApi.group.meta(field).modes.length > 0
  )
  const groupableFields = fields.filter(isGroupable)
  const field = groupableFields.reduce<(typeof groupableFields)[number] | undefined>((best, candidate) => {
    if (!best) {
      return candidate
    }

    const bestPriority = fieldSpec.view.kanbanGroupPriority(best)
    const candidatePriority = fieldSpec.view.kanbanGroupPriority(candidate)
    return candidatePriority > bestPriority
      ? candidate
      : best
  }, undefined)

  return field
    ? group.set(undefined, field)
    : undefined
}

const ensureKanbanGroup = (
  reader: DocumentReader,
  view: View
): View => {
  if (view.type !== 'kanban' || view.group) {
    return view
  }

  const group = resolveDefaultKanbanGroup(reader)
  return group
    ? {
        ...view,
        group
      }
    : view
}

const lowerViewCreate = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'view.create' }>
): PlannedActionResult => {
  const explicitViewId = string.trimToUndefined(action.input.id)
  const preferredName = string.trimToUndefined(action.input.name) ?? ''

  if (action.input.id !== undefined && !explicitViewId) {
    scope.issue(
      'view.invalid',
      'View id must be a non-empty string',
      'input.id'
    )
  }
  if (explicitViewId && scope.reader.views.has(explicitViewId)) {
    scope.issue(
      'view.invalid',
      `View already exists: ${explicitViewId}`,
      'input.id'
    )
  }
  if (!preferredName) {
    scope.issue(
      'view.invalid',
      'View name must be a non-empty string',
      'input.name'
    )
  }
  if (!preferredName || (action.input.id !== undefined && !explicitViewId) || (explicitViewId && scope.reader.views.has(explicitViewId))) {
    return scope.finish()
  }

  const fields = scope.reader.fields.list()
  const view = ensureKanbanGroup(scope.reader, normalizeView(scope.reader, {
    id: explicitViewId || createViewId(),
    name: viewApi.name.unique({
      views: scope.reader.views.list(),
      preferredName
    }),
    type: action.input.type,
    search: action.input.search ?? { query: '' },
    filter: action.input.filter ?? { mode: 'and', rules: [] },
    sort: action.input.sort ?? [],
    ...(action.input.group ? { group: action.input.group } : {}),
    calc: action.input.calc ?? {},
    display: action.input.display
      ? viewApi.display.clone(action.input.display)
      : viewApi.options.defaultDisplay(action.input.type, fields),
    options: action.input.options
      ? viewApi.options.clone(action.input.options)
      : viewApi.options.defaults(action.input.type, fields),
    orders: action.input.orders ? [...action.input.orders] : []
  } satisfies View))

  scope.report(...validateView(scope.reader, scope.source, view))
  return scope.finish(toViewPut(view))
}

const lowerViewPatch = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'view.patch' }>
): PlannedActionResult => {
  const view = scope.require(
    scope.reader.views.get(action.viewId),
    {
      code: 'view.notFound',
      message: `Unknown view: ${action.viewId}`,
      path: 'viewId'
    }
  )
  if (!view) {
    return scope.finish()
  }

  const nextView = (
    action.patch.type === 'kanban'
      ? ensureKanbanGroup(scope.reader, normalizeView(scope.reader, applyViewPatch(view, action.patch)))
      : normalizeView(scope.reader, applyViewPatch(view, action.patch))
  )
  if (equal.sameJsonValue(nextView, view)) {
    return scope.finish()
  }

  scope.report(...validateView(scope.reader, scope.source, nextView))
  return scope.finish(toViewPut(nextView))
}

const lowerViewOpen = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'view.open' }>
): PlannedActionResult => {
  const view = scope.require(
    scope.reader.views.get(action.viewId),
    {
      code: 'view.notFound',
      message: `Unknown view: ${action.viewId}`,
      path: 'viewId'
    }
  )
  return view
    ? scope.finish({
        type: 'document.activeView.set',
        viewId: view.id
      })
    : scope.finish()
}

const lowerViewRemove = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'view.remove' }>
): PlannedActionResult => {
  const view = scope.require(
    scope.reader.views.get(action.viewId),
    {
      code: 'view.notFound',
      message: `Unknown view: ${action.viewId}`,
      path: 'viewId'
    }
  )
  return view
    ? scope.finish({
        type: 'document.view.remove',
        viewId: view.id
      })
    : scope.finish()
}

export const planViewAction = (
  scope: PlannerScope,
  action: Action
): PlannedActionResult => {
  switch (action.type) {
    case 'view.create':
      return lowerViewCreate(scope, action)
    case 'view.patch':
      return lowerViewPatch(scope, action)
    case 'view.open':
      return lowerViewOpen(scope, action)
    case 'view.remove':
      return lowerViewRemove(scope, action)
    default:
      throw new Error(`Unsupported view planner action: ${action.type}`)
  }
}

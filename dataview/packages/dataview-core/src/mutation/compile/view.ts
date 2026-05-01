import type {
  Field,
  FieldId,
  Filter,
  FilterRule,
  Intent,
  RecordId,
  Search,
  Sort,
  SortRule,
  View,
  ViewCalc,
  ViewDisplay,
  ViewFilterRuleId,
  ViewGroup,
  ViewId,
  ViewSortRuleId
} from '@dataview/core/types'
import type {
  GalleryOptions,
  KanbanOptions,
  TableOptions
} from '@dataview/core/types/state'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS
} from '@dataview/core/types/state'
import {
  calculation,
  view as viewApi
} from '@dataview/core/view'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  createId,
  entityTable,
  equal,
  string
} from '@shared/core'
import {
  type IssueSource,
  type ValidationIssue
} from './contracts'
import {
  issue as compileIssue,
  reportIssues,
  requireValue,
  type DataviewCompileContext,
  type DataviewCompileContext as DataviewCompileInput
} from './base'
import type { DocumentReader } from '../../document/reader'
import {
  documentViews
} from '../../document/views'
import {
  writeViewUpdate
} from './viewDiff'
import {
  applyRecordOrder,
  reorderRecordIds,
  spliceRecordIds
} from '../../view/order'
import {
  resolveDefaultKanbanGroup,
  setViewType
} from '../../view/update'

const readErrorMessage = (
  error: unknown,
  fallback: string
): string => error instanceof Error
  ? error.message
  : fallback

const reportSemanticError = (
  input: DataviewCompileInput,
  error: unknown,
  path: string
) => {
  compileIssue(
    input,
    'view.invalidProjection',
    readErrorMessage(error, 'Invalid view operation.'),
    path
  )
}

const cloneFilterValueForOperation = (
  value: FilterRule['value']
): FilterRule['value'] => {
  if (
    typeof value === 'object'
    && value !== null
    && 'kind' in value
    && value.kind === 'option-set'
  ) {
    return {
      kind: 'option-set',
      optionIds: [...value.optionIds]
    }
  }

  return structuredClone(value)
}

const cloneFilterRuleForOperation = (
  rule: FilterRule
): FilterRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  presetId: rule.presetId,
  ...(Object.prototype.hasOwnProperty.call(rule, 'value')
    ? {
        value: cloneFilterValueForOperation(rule.value)
      }
    : {})
})

const cloneSortRuleForOperation = (
  rule: SortRule
): SortRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  direction: rule.direction
})

const issue = (
  source: IssueSource,
  code: ValidationIssue['code'],
  message: string,
  path?: string
): ValidationIssue => ({
  source,
  severity: 'error',
  code,
  message,
  ...(path === undefined
    ? {}
    : {
        path
      })
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
      issues.push(issue(source, 'view.invalidProjection', 'field id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(fieldId)) {
      issues.push(issue(source, 'view.invalidProjection', `Duplicate field id: ${fieldId}`, `${path}.${index}`))
      return
    }
    seen.add(fieldId)
    if (!reader.fields.has(fieldId)) {
      issues.push(issue(source, 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${index}`))
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
    issues.push(issue(source, 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
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
  viewApi.filter.rules.list(filter.rules).forEach((rule, index) => {
    if (!string.isNonEmptyString(rule.fieldId)) {
      issues.push(issue(source, 'view.invalidProjection', `Filter field id must be a non-empty string (${rule.id})`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!string.isNonEmptyString(rule.presetId)) {
      issues.push(issue(source, 'view.invalidProjection', `Filter preset id must be a non-empty string (${rule.id})`, `${path}.rules.${index}.presetId`))
      return
    }
    const field = reader.fields.get(rule.fieldId)
    if (!field) {
      issues.push(issue(source, 'field.notFound', `Unknown field: ${rule.fieldId} (${rule.id})`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!viewApi.filter.rule.hasPreset(field, rule.presetId)) {
      issues.push(issue(source, 'view.invalidProjection', `Filter preset ${rule.presetId} is invalid for ${field.kind} fields (${rule.id})`, `${path}.rules.${index}.presetId`))
    }
  })
  return issues
}

const validateSort = (
  reader: DocumentReader,
  source: IssueSource,
  sort: Sort,
  path = 'view.sort'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  viewApi.sort.rules.list(sort.rules).forEach((rule, index) => {
    if (!string.isNonEmptyString(rule.fieldId)) {
      issues.push(issue(source, 'view.invalidProjection', `Sort field must be a non-empty string (${rule.id})`, `${path}.rules.${index}.fieldId`))
    } else if (!reader.fields.has(rule.fieldId)) {
      issues.push(issue(source, 'field.notFound', `Unknown field: ${rule.fieldId} (${rule.id})`, `${path}.rules.${index}.fieldId`))
    } else if (seen.has(rule.fieldId)) {
      issues.push(issue(source, 'view.invalidProjection', `Duplicate sort field: ${rule.fieldId} (${rule.id})`, `${path}.rules.${index}.fieldId`))
    } else {
      seen.add(rule.fieldId)
    }

    if (rule.direction !== 'asc' && rule.direction !== 'desc') {
      issues.push(issue(source, 'view.invalidProjection', `Sort direction must be asc or desc (${rule.id})`, `${path}.rules.${index}.direction`))
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

  const issues = string.isNonEmptyString(group.fieldId)
    ? []
    : [issue(source, 'view.invalidProjection', 'group field must be a non-empty string', `${path}.fieldId`)]

  const field = string.isNonEmptyString(group.fieldId)
    ? reader.fields.get(group.fieldId)
    : undefined
  const fieldGroupMeta = field
    ? fieldApi.group.meta(field)
    : undefined
  const fieldGroupMetaForMode = field
    ? fieldApi.group.meta(field, {
        mode: group.mode
      })
    : undefined

  if (!field) {
    issues.push(issue(source, 'field.notFound', `Unknown field: ${group.fieldId}`, `${path}.fieldId`))
  }
  if (!string.isNonEmptyString(group.mode)) {
    issues.push(issue(source, 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (field && (!fieldGroupMeta?.modes.length || !fieldGroupMeta.modes.includes(group.mode))) {
    issues.push(issue(source, 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }
  if (!fieldApi.group.sort.isBucket(group.bucketSort)) {
    issues.push(issue(source, 'view.invalidProjection', 'group bucketSort is invalid', `${path}.bucketSort`))
  } else if (field && !fieldGroupMetaForMode?.sorts.includes(group.bucketSort)) {
    issues.push(issue(source, 'view.invalidProjection', 'group bucketSort is invalid for this field', `${path}.bucketSort`))
  }
  if (group.bucketInterval !== undefined) {
    if (typeof group.bucketInterval !== 'number' || !Number.isFinite(group.bucketInterval) || group.bucketInterval <= 0) {
      issues.push(issue(source, 'view.invalidProjection', 'group bucketInterval must be a positive finite number', `${path}.bucketInterval`))
    } else if (field && !fieldGroupMetaForMode?.supportsInterval) {
      issues.push(issue(source, 'view.invalidProjection', 'group bucketInterval is invalid for this field', `${path}.bucketInterval`))
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
      issues.push(issue(source, 'view.invalidProjection', 'width field id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!reader.fields.has(fieldId)) {
      issues.push(issue(source, 'field.notFound', `Unknown field: ${fieldId}`, `${path}.widths.${fieldId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(issue(source, 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${fieldId}`))
    }
  })
  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(issue(source, 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }
  if (typeof table.wrap !== 'boolean') {
    issues.push(issue(source, 'view.invalidProjection', 'table.wrap must be boolean', `${path}.wrap`))
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
    issues.push(issue(source, 'view.invalidProjection', 'gallery.card.wrap must be boolean', `${path}.card.wrap`))
  }
  if (!['sm', 'md', 'lg'].includes(gallery.card.size)) {
    issues.push(issue(source, 'view.invalidProjection', 'gallery.card.size is invalid', `${path}.card.size`))
  }
  if (gallery.card.layout !== 'compact' && gallery.card.layout !== 'stacked') {
    issues.push(issue(source, 'view.invalidProjection', 'gallery.card.layout is invalid', `${path}.card.layout`))
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
    issues.push(issue(source, 'view.invalidProjection', 'kanban.card.wrap must be boolean', `${path}.card.wrap`))
  }
  if (!['sm', 'md', 'lg'].includes(kanban.card.size)) {
    issues.push(issue(source, 'view.invalidProjection', 'kanban.card.size is invalid', `${path}.card.size`))
  }
  if (kanban.card.layout !== 'compact' && kanban.card.layout !== 'stacked') {
    issues.push(issue(source, 'view.invalidProjection', 'kanban.card.layout is invalid', `${path}.card.layout`))
  }
  if (typeof kanban.fillColumnColor !== 'boolean') {
    issues.push(issue(source, 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', `${path}.fillColumnColor`))
  }
  if (!KANBAN_CARDS_PER_COLUMN_OPTIONS.includes(kanban.cardsPerColumn)) {
    issues.push(issue(source, 'view.invalidProjection', 'kanban.cardsPerColumn is invalid', `${path}.cardsPerColumn`))
  }
  return issues
}

const validateViewOptions = (
  reader: DocumentReader,
  source: IssueSource,
  viewType: View['type'],
  options: View['options'],
  path = 'view.options'
) => {
  switch (viewType) {
    case 'table':
      return validateTableOptions(reader, source, options as TableOptions, path)
    case 'gallery':
      return validateGalleryOptions(source, options as GalleryOptions, path)
    case 'kanban':
      return validateKanbanOptions(source, options as KanbanOptions, path)
  }
}

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
      issues.push(issue(source, 'view.invalidOrder', 'orders must only contain non-empty record ids', `${path}.${index}`))
      return
    }
    if (seen.has(recordId)) {
      issues.push(issue(source, 'view.invalidOrder', `Duplicate record id: ${recordId}`, `${path}.${index}`))
      return
    }
    seen.add(recordId)
    if (!reader.records.has(recordId)) {
      issues.push(issue(source, 'record.notFound', `Unknown record: ${recordId}`, `${path}.${index}`))
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
      issues.push(issue(source, 'view.invalidProjection', 'Calculation field must be a non-empty string', path))
      return
    }
    const field = reader.fields.get(fieldId as FieldId)
    if (!field) {
      issues.push(issue(source, 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${fieldId}`))
      return
    }
    if (!calculation.metric.is(metric)) {
      issues.push(issue(source, 'view.invalidProjection', 'Calculation metric is invalid', `${path}.${fieldId}`))
      return
    }
    if (!calculation.metric.supports(field, metric)) {
      issues.push(issue(source, 'view.invalidProjection', `Calculation metric ${metric} is invalid for ${field.kind} fields`, `${path}.${fieldId}`))
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
    issues.push(issue(source, 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!string.isNonEmptyString(view.name)) {
    issues.push(issue(source, 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!string.isNonEmptyString(view.type)) {
    issues.push(issue(source, 'view.invalid', 'View type must be a non-empty string', 'view.type'))
  }

  issues.push(
    ...validateSearch(reader, source, view.search),
    ...validateFilter(reader, source, view.filter),
    ...validateSort(reader, source, view.sort),
    ...validateGroup(reader, source, view.group),
    ...validateCalc(reader, source, view.calc),
    ...validateDisplay(reader, source, view.display),
    ...validateViewOptions(reader, source, view.type, view.options),
    ...validateOrders(reader, source, view.orders)
  )

  return issues
}

const normalizeView = (
  reader: DocumentReader,
  view: View
): View => {
  const fields = reader.fields.list()
  const nextGroup = viewApi.group.state.normalize(view.group)
  const normalizedShared = {
    id: view.id,
    name: view.name,
    search: viewApi.search.state.normalize(view.search),
    filter: viewApi.filter.state.normalize(view.filter),
    sort: {
      rules: viewApi.sort.rules.normalize(view.sort.rules)
    },
    calc: calculation.view.normalize(view.calc, {
      fields: new Map(fields.map((field) => [field.id, field] as const))
    }),
    display: viewApi.display.normalize(view.display),
    orders: [...view.orders]
  }

  switch (view.type) {
    case 'table':
      return {
        ...normalizedShared,
        type: 'table',
        ...(nextGroup ? { group: nextGroup } : {}),
        options: viewApi.options.normalize(view.options, {
          type: 'table',
          fields
        })
      }
    case 'gallery':
      return {
        ...normalizedShared,
        type: 'gallery',
        ...(nextGroup ? { group: nextGroup } : {}),
        options: viewApi.options.normalize(view.options, {
          type: 'gallery',
          fields
        })
      }
    case 'kanban':
      return {
        ...normalizedShared,
        type: 'kanban',
        group: nextGroup ?? resolveDefaultKanbanGroup(fields) ?? view.group,
        options: viewApi.options.normalize(view.options, {
          type: 'kanban',
          fields
        })
      }
  }
}

const ensureKanbanGroup = (
  reader: DocumentReader,
  view: View
): View => {
  if (view.type !== 'kanban' || view.group) {
    return view
  }

  const group = resolveDefaultKanbanGroup(reader.fields.list())
  return group
    ? {
        ...view,
        group
      }
    : view
}

const finalizeView = (
  reader: DocumentReader,
  view: View
): View => ensureKanbanGroup(reader, normalizeView(reader, view))

const emitValidatedViewUpdate = <T,>(
  input: DataviewCompileInput,
  reader: DocumentReader,
  current: View,
  next: View,
  data?: T
) => {
  if (equal.sameJsonValue(current, next)) {
    return undefined
  }

  reportIssues(input, ...validateView(reader, input.source, next))
  writeViewUpdate(input.program, current, next)
  if (data !== undefined) {
    input.output(data)
  }
  return data
}

const requireView = (
  input: DataviewCompileInput,
  reader: DocumentReader,
  viewId: ViewId
) => requireValue(
  input,
  reader.views.get(viewId),
  {
    code: 'view.notFound',
    message: `Unknown view: ${viewId}`,
    path: 'id'
  }
)

const requireField = (
  input: DataviewCompileInput,
  reader: DocumentReader,
  fieldId: FieldId,
  path = 'fieldId'
): Field | undefined => requireValue(
  input,
  reader.fields.get(fieldId),
  {
    code: 'field.notFound',
    message: `Unknown field: ${fieldId}`,
    path
  }
)

const requireGroupedField = (
  input: DataviewCompileInput,
  reader: DocumentReader,
  view: View
): Field | undefined => {
  const fieldId = view.group?.fieldId
  return fieldId
    ? requireField(input, reader, fieldId, 'fieldId')
    : (compileIssue(
        input,
        'view.invalidProjection',
        'View is not grouped.',
        'id'
      ), undefined)
}

const lowerViewCreate = (
  intent: Extract<Intent, { type: 'view.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const explicitViewId = string.trimToUndefined(intent.input.id)
  const preferredName = string.trimToUndefined(intent.input.name) ?? ''

  if (intent.input.id !== undefined && !explicitViewId) {
    compileIssue(input, 'view.invalid', 'View id must be a non-empty string', 'input.id')
  }
  if (explicitViewId && reader.views.has(explicitViewId)) {
    compileIssue(input, 'view.invalid', `View already exists: ${explicitViewId}`, 'input.id')
  }
  if (!preferredName) {
    compileIssue(input, 'view.invalid', 'View name must be a non-empty string', 'input.name')
  }
  if (!preferredName || (intent.input.id !== undefined && !explicitViewId) || (explicitViewId && reader.views.has(explicitViewId))) {
    return
  }

  const fields = reader.fields.list()
  const base = {
    id: explicitViewId ?? createId('view'),
    name: viewApi.name.unique({
      views: reader.views.list(),
      preferredName
    }),
    search: intent.input.search ?? {
      query: ''
    },
    filter: intent.input.filter ?? {
      mode: 'and',
      rules: entityTable.normalize.list([])
    },
    sort: intent.input.sort ?? {
      rules: entityTable.normalize.list([])
    },
    calc: intent.input.calc ?? {},
    display: intent.input.display
      ? viewApi.display.clone(intent.input.display)
      : viewApi.options.defaultDisplay(intent.input.type, fields),
    orders: []
  }

  let created: View
  switch (intent.input.type) {
    case 'table':
      created = {
        ...base,
        type: 'table',
        ...(intent.input.group ? { group: viewApi.group.state.clone(intent.input.group) } : {}),
        options: intent.input.options
          ? viewApi.options.clone('table', intent.input.options)
          : viewApi.options.defaults('table', fields)
      }
      break
    case 'gallery':
      created = {
        ...base,
        type: 'gallery',
        ...(intent.input.group ? { group: viewApi.group.state.clone(intent.input.group) } : {}),
        options: intent.input.options
          ? viewApi.options.clone('gallery', intent.input.options)
          : viewApi.options.defaults('gallery', fields)
      }
      break
    case 'kanban': {
      const resolvedGroup = intent.input.group ?? resolveDefaultKanbanGroup(fields)
      if (!resolvedGroup) {
        compileIssue(input, 'view.invalidProjection', 'Kanban view requires a groupable field', 'input.group')
        return
      }

      created = {
        ...base,
        type: 'kanban',
        group: viewApi.group.state.clone(resolvedGroup)!,
        options: intent.input.options
          ? viewApi.options.clone('kanban', intent.input.options)
          : viewApi.options.defaults('kanban', fields)
      }
      break
    }
  }

  const view = finalizeView(reader, created)
  reportIssues(input, ...validateView(reader, input.source, view))
  input.program.view.create(view)
  if (input.document.activeViewId === undefined) {
    input.program.document.patch({
      activeViewId: view.id
    })
  }
  input.output({
    id: view.id
  })
}

const lowerViewRename = (
  intent: Extract<Intent, { type: 'view.rename' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const name = string.trimToUndefined(intent.name)
  if (!name) {
    compileIssue(input, 'view.invalid', 'View name must be a non-empty string', 'name')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    name
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewTypeSet = (
  intent: Extract<Intent, { type: 'view.type.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextCandidate = setViewType({
    view,
    type: intent.viewType,
    fields: reader.fields.list()
  })
  if (!nextCandidate) {
    compileIssue(input, 'view.invalidProjection', 'Kanban view requires a groupable field', 'viewType')
    return
  }

  const nextView = finalizeView(reader, nextCandidate)
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewSearchSet = (
  intent: Extract<Intent, { type: 'view.search.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    search: viewApi.search.state.clone(intent.search)
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewFilterCreate = (
  intent: Extract<Intent, { type: 'view.filter.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  const field = requireField(input, reader, intent.input.fieldId, 'input.fieldId')
  if (!view || !field) {
    return
  }

  const explicitRuleId = intent.input.id === undefined
    ? undefined
    : string.trimToUndefined(intent.input.id)
  if (intent.input.id !== undefined && !explicitRuleId) {
    compileIssue(input, 'view.invalidProjection', 'Filter rule id must be a non-empty string', 'input.id')
    return
  }

  try {
    const created = viewApi.filter.write.insert(view.filter, field, {
      ...(explicitRuleId !== undefined
        ? { id: explicitRuleId }
        : {}),
      ...(intent.input.presetId !== undefined
        ? { presetId: intent.input.presetId }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(intent.input, 'value')
        ? { value: intent.input.value }
        : {}),
      ...(intent.before !== undefined
        ? { before: intent.before }
        : {})
    })
    const nextView = finalizeView(reader, {
      ...view,
      filter: created.filter
    })
    const rule = nextView.filter.rules.byId[created.id] ?? created.filter.rules.byId[created.id]
    if (!rule) {
      compileIssue(input, 'view.invalidProjection', `Unable to create filter rule ${created.id}`, 'input')
      return
    }

    return emitValidatedViewUpdate(input, reader, view, nextView, {
      id: created.id
    })
  } catch (error) {
    reportSemanticError(input, error, 'input')
  }
}

const lowerViewFilterPatch = (
  intent: Extract<Intent, { type: 'view.filter.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const currentRule = view.filter.rules.byId[intent.rule]
  if (!currentRule) {
    compileIssue(input, 'view.invalidProjection', `Unknown filter rule: ${intent.rule}`, 'rule')
    return
  }

  const nextFieldId = intent.patch.fieldId ?? currentRule.fieldId
  const field = requireField(input, reader, nextFieldId, 'patch.fieldId')
  if (!field) {
    return
  }

  try {
    const nextFilter = viewApi.filter.write.patch(
      view.filter,
      intent.rule,
      intent.patch,
      field
    )
    const nextView = finalizeView(reader, {
      ...view,
      filter: nextFilter
    })
    return emitValidatedViewUpdate(input, reader, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'patch')
  }
}

const lowerViewFilterMove = (
  intent: Extract<Intent, { type: 'view.filter.move' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  try {
    const nextFilter = viewApi.filter.write.move(
      view.filter,
      intent.rule,
      intent.before
    )
    const nextView = finalizeView(reader, {
      ...view,
      filter: nextFilter
    })
    return emitValidatedViewUpdate(input, reader, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewFilterModeSet = (
  intent: Extract<Intent, { type: 'view.filter.mode.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    filter: viewApi.filter.write.mode(view.filter, intent.mode)
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewFilterRemove = (
  intent: Extract<Intent, { type: 'view.filter.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  try {
    const nextView = finalizeView(reader, {
      ...view,
      filter: viewApi.filter.write.remove(view.filter, intent.rule)
    })
    return emitValidatedViewUpdate(input, reader, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewFilterClear = (
  intent: Extract<Intent, { type: 'view.filter.clear' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    filter: viewApi.filter.write.clear(view.filter)
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewSortCreate = (
  intent: Extract<Intent, { type: 'view.sort.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  if (!requireField(input, reader, intent.input.fieldId, 'input.fieldId')) {
    return
  }

  const explicitRuleId = intent.input.id === undefined
    ? undefined
    : string.trimToUndefined(intent.input.id)
  if (intent.input.id !== undefined && !explicitRuleId) {
    compileIssue(input, 'view.invalidProjection', 'Sort rule id must be a non-empty string', 'input.id')
    return
  }

  try {
    const created = viewApi.sort.write.insert(view.sort, {
      ...(explicitRuleId !== undefined
        ? { id: explicitRuleId }
        : {}),
      fieldId: intent.input.fieldId,
      ...(intent.input.direction !== undefined
        ? { direction: intent.input.direction }
        : {}),
      ...(intent.before !== undefined
        ? { before: intent.before }
        : {})
    })
    const nextView = finalizeView(reader, {
      ...view,
      sort: created.sort
    })
    const rule = nextView.sort.rules.byId[created.id] ?? created.sort.rules.byId[created.id]
    if (!rule) {
      compileIssue(input, 'view.invalidProjection', `Unable to create sort rule ${created.id}`, 'input')
      return
    }

    return emitValidatedViewUpdate(input, reader, view, nextView, {
      id: created.id
    })
  } catch (error) {
    reportSemanticError(input, error, 'input')
  }
}

const lowerViewSortPatch = (
  intent: Extract<Intent, { type: 'view.sort.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  if (intent.patch.fieldId && !requireField(input, reader, intent.patch.fieldId, 'patch.fieldId')) {
    return
  }

  try {
    const nextSort = viewApi.sort.write.patch(
      view.sort,
      intent.rule,
      intent.patch
    )
    const nextView = finalizeView(reader, {
      ...view,
      sort: nextSort
    })
    const rule = nextView.sort.rules.byId[intent.rule]
    if (!rule) {
      compileIssue(input, 'view.invalidProjection', `Unknown sort rule: ${intent.rule}`, 'rule')
      return
    }

    return emitValidatedViewUpdate(input, reader, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'patch')
  }
}

const lowerViewSortMove = (
  intent: Extract<Intent, { type: 'view.sort.move' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  try {
    const nextSort = viewApi.sort.write.move(
      view.sort,
      intent.rule,
      intent.before
    )
    const nextView = finalizeView(reader, {
      ...view,
      sort: nextSort
    })
    return emitValidatedViewUpdate(input, reader, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewSortRemove = (
  intent: Extract<Intent, { type: 'view.sort.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  try {
    const nextView = finalizeView(reader, {
      ...view,
      sort: viewApi.sort.write.remove(view.sort, intent.rule)
    })
    return emitValidatedViewUpdate(input, reader, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewSortClear = (
  intent: Extract<Intent, { type: 'view.sort.clear' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    sort: viewApi.sort.write.clear(view.sort)
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupSet = (
  intent: Extract<Intent, { type: 'view.group.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: viewApi.group.state.clone(intent.group)
  } as View)
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupClear = (
  intent: Extract<Intent, { type: 'view.group.clear' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: viewApi.group.clear(view.group)
  } as View)
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupToggle = (
  intent: Extract<Intent, { type: 'view.group.toggle' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  const field = requireField(input, reader, intent.field, 'field')
  if (!view || !field) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: viewApi.group.toggle(view.group, field)
  } as View)
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupModeSet = (
  intent: Extract<Intent, { type: 'view.group.mode.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const field = requireGroupedField(input, reader, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.patch(view.group, field, {
    mode: intent.mode
  })
  if (!nextGroup) {
    compileIssue(input, 'view.invalidProjection', 'Unable to update group mode.', 'mode')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: nextGroup
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupSortSet = (
  intent: Extract<Intent, { type: 'view.group.sort.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const field = requireGroupedField(input, reader, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.patch(view.group, field, {
    bucketSort: intent.sort
  })
  if (!nextGroup) {
    compileIssue(input, 'view.invalidProjection', 'Unable to update group sort.', 'sort')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: nextGroup
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupIntervalSet = (
  intent: Extract<Intent, { type: 'view.group.interval.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const field = requireGroupedField(input, reader, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.patch(view.group, field, {
    bucketInterval: intent.interval
  })
  if (!nextGroup) {
    compileIssue(input, 'view.invalidProjection', 'Unable to update group interval.', 'interval')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: nextGroup
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGroupShowEmptySet = (
  intent: Extract<Intent, { type: 'view.group.showEmpty.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const field = requireGroupedField(input, reader, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.patch(view.group, field, {
    showEmpty: intent.value
  })
  if (!nextGroup) {
    compileIssue(input, 'view.invalidProjection', 'Unable to update group empty-bucket visibility.', 'value')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: nextGroup
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewSectionVisibility = (
  intent: Extract<Intent, { type: 'view.section.show' | 'view.section.hide' | 'view.section.collapse' | 'view.section.expand' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const field = requireGroupedField(input, reader, view)
  if (!field) {
    return
  }

  const patch = intent.type === 'view.section.show'
    ? {
        hidden: false
      }
    : intent.type === 'view.section.hide'
      ? {
          hidden: true
        }
      : intent.type === 'view.section.collapse'
        ? {
            collapsed: true
          }
        : {
            collapsed: false
          }

  const nextGroup = viewApi.group.bucket.patch(
    view.group,
    field,
    intent.bucket,
    patch
  )
  if (!nextGroup) {
    compileIssue(input, 'view.invalidProjection', 'Unable to update group section state.', 'bucket')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    group: nextGroup
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewCalcSet = (
  intent: Extract<Intent, { type: 'view.calc.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  if (!requireField(input, reader, intent.field, 'field')) {
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    calc: viewApi.calc.set(view.calc, intent.field, intent.metric ?? null)
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewTableWidthsSet = (
  intent: Extract<Intent, { type: 'view.table.widths.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'table') {
    compileIssue(input, 'view.invalidProjection', 'view.table.widths.set requires a table view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.table.patch(view.options, {
      widths: intent.widths
    })
  })
  if (nextView.type !== 'table') {
    compileIssue(input, 'view.invalidProjection', 'view.table.widths.set produced a non-table view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewTableVerticalLinesSet = (
  intent: Extract<Intent, { type: 'view.table.verticalLines.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'table') {
    compileIssue(input, 'view.invalidProjection', 'view.table.verticalLines.set requires a table view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.table.patch(view.options, {
      showVerticalLines: intent.value
    })
  })
  if (nextView.type !== 'table') {
    compileIssue(input, 'view.invalidProjection', 'view.table.verticalLines.set produced a non-table view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewTableWrapSet = (
  intent: Extract<Intent, { type: 'view.table.wrap.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'table') {
    compileIssue(input, 'view.invalidProjection', 'view.table.wrap.set requires a table view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.table.patch(view.options, {
      wrap: intent.value
    })
  })
  if (nextView.type !== 'table') {
    compileIssue(input, 'view.invalidProjection', 'view.table.wrap.set produced a non-table view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGalleryWrapSet = (
  intent: Extract<Intent, { type: 'view.gallery.wrap.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'gallery') {
    compileIssue(input, 'view.invalidProjection', 'view.gallery.wrap.set requires a gallery view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        wrap: intent.value
      }
    })
  })
  if (nextView.type !== 'gallery') {
    compileIssue(input, 'view.invalidProjection', 'view.gallery.wrap.set produced a non-gallery view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGallerySizeSet = (
  intent: Extract<Intent, { type: 'view.gallery.size.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'gallery') {
    compileIssue(input, 'view.invalidProjection', 'view.gallery.size.set requires a gallery view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        size: intent.value
      }
    })
  })
  if (nextView.type !== 'gallery') {
    compileIssue(input, 'view.invalidProjection', 'view.gallery.size.set produced a non-gallery view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewGalleryLayoutSet = (
  intent: Extract<Intent, { type: 'view.gallery.layout.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'gallery') {
    compileIssue(input, 'view.invalidProjection', 'view.gallery.layout.set requires a gallery view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        layout: intent.value
      }
    })
  })
  if (nextView.type !== 'gallery') {
    compileIssue(input, 'view.invalidProjection', 'view.gallery.layout.set produced a non-gallery view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewKanbanWrapSet = (
  intent: Extract<Intent, { type: 'view.kanban.wrap.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.wrap.set requires a kanban view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        wrap: intent.value
      }
    })
  })
  if (nextView.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.wrap.set produced a non-kanban view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewKanbanSizeSet = (
  intent: Extract<Intent, { type: 'view.kanban.size.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.size.set requires a kanban view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        size: intent.value
      }
    })
  })
  if (nextView.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.size.set produced a non-kanban view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewKanbanLayoutSet = (
  intent: Extract<Intent, { type: 'view.kanban.layout.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.layout.set requires a kanban view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        layout: intent.value
      }
    })
  })
  if (nextView.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.layout.set produced a non-kanban view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewKanbanFillColorSet = (
  intent: Extract<Intent, { type: 'view.kanban.fillColor.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.fillColor.set requires a kanban view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.kanban.patch(view.options, {
      fillColumnColor: intent.value
    })
  })
  if (nextView.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.fillColor.set produced a non-kanban view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewKanbanCardsPerColumnSet = (
  intent: Extract<Intent, { type: 'view.kanban.cardsPerColumn.set' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.cardsPerColumn.set requires a kanban view', 'id')
    return
  }

  const nextView = finalizeView(reader, {
    ...view,
    options: viewApi.layout.kanban.patch(view.options, {
      cardsPerColumn: intent.value
    })
  })
  if (nextView.type !== 'kanban') {
    compileIssue(input, 'view.invalidProjection', 'view.kanban.cardsPerColumn.set produced a non-kanban view', 'id')
    return
  }
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewOpen = (
  intent: Extract<Intent, { type: 'view.open' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  input.program.document.patch({
    activeViewId: view.id
  })
}

const lowerViewOrderMove = (
  intent: Extract<Intent, { type: 'view.order.move' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const recordId = string.trimToUndefined(intent.record)
  if (!recordId) {
    compileIssue(input, 'view.invalidOrder', 'view.order.move requires a non-empty record id', 'record')
    return
  }
  if (!reader.records.has(recordId)) {
    compileIssue(input, 'record.notFound', `Unknown record: ${recordId}`, 'record')
    return
  }

  const beforeRecordId = string.trimToUndefined(intent.before)
  if (beforeRecordId !== undefined && beforeRecordId !== recordId && !reader.records.has(beforeRecordId)) {
    compileIssue(input, 'record.notFound', `Unknown record: ${beforeRecordId}`, 'before')
    return
  }

  const currentOrder = applyRecordOrder(
    reader.records.list().map((record) => record.id),
    view.orders
  )
  const nextView = finalizeView(reader, {
    ...view,
    orders: reorderRecordIds(currentOrder, recordId, {
      ...(beforeRecordId !== undefined && beforeRecordId !== recordId
        ? {
            beforeRecordId
          }
        : {})
    })
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewOrderSplice = (
  intent: Extract<Intent, { type: 'view.order.splice' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const recordIds = Array.from(new Set(
    intent.records
      .map((recordId) => string.trimToUndefined(recordId))
      .filter((recordId): recordId is RecordId => Boolean(recordId))
  ))
  if (!recordIds.length) {
    compileIssue(input, 'view.invalidOrder', 'view.order.splice requires at least one record id', 'records')
    return
  }
  if (recordIds.some((recordId) => !reader.records.has(recordId))) {
    const missing = recordIds.find((recordId) => !reader.records.has(recordId))
    compileIssue(input, 'record.notFound', `Unknown record: ${missing}`, 'records')
    return
  }

  const beforeRecordId = string.trimToUndefined(intent.before)
  if (beforeRecordId !== undefined && !reader.records.has(beforeRecordId)) {
    compileIssue(input, 'record.notFound', `Unknown record: ${beforeRecordId}`, 'before')
    return
  }

  const currentOrder = applyRecordOrder(
    reader.records.list().map((record) => record.id),
    view.orders
  )
  const nextView = finalizeView(reader, {
    ...view,
    orders: spliceRecordIds(currentOrder, recordIds, {
      ...(beforeRecordId !== undefined
        ? {
            beforeRecordId
          }
        : {})
    })
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewDisplayMove = (
  intent: Extract<Intent, { type: 'view.display.move' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  if (!requireView(input, reader, intent.id)) {
    return
  }
  if (!reader.fields.has(intent.field)) {
    compileIssue(input, 'field.notFound', `Unknown field: ${intent.field}`, 'field')
    return
  }

  input.program.view.display.move(
    intent.id,
    intent.field,
    intent.before !== undefined && intent.before !== intent.field
      ? {
          before: intent.before
        }
      : undefined
  )
}

const lowerViewDisplaySplice = (
  intent: Extract<Intent, { type: 'view.display.splice' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  if (!requireView(input, reader, intent.id)) {
    return
  }

  const fieldIds = Array.from(new Set(intent.fields))
  if (!fieldIds.length) {
    compileIssue(input, 'view.invalidProjection', 'view.display.splice requires at least one field id', 'fields')
    return
  }
  if (fieldIds.some((fieldId) => !reader.fields.has(fieldId))) {
    const missing = fieldIds.find((fieldId) => !reader.fields.has(fieldId))
    compileIssue(input, 'field.notFound', `Unknown field: ${missing}`, 'fields')
    return
  }

  input.program.view.display.splice(
    intent.id,
    fieldIds,
    intent.before !== undefined
      ? {
          before: intent.before
        }
      : undefined
  )
}

const lowerViewDisplayShow = (
  intent: Extract<Intent, { type: 'view.display.show' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  if (!requireView(input, reader, intent.id)) {
    return
  }
  if (!reader.fields.has(intent.field)) {
    compileIssue(input, 'field.notFound', `Unknown field: ${intent.field}`, 'field')
    return
  }

  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextFields = view.display.fields.includes(intent.field)
    ? viewApi.display.move(
        view.display,
        [intent.field],
        intent.before !== undefined && intent.before !== intent.field
          ? intent.before
          : undefined
      ).fields
    : viewApi.display.show(
        view.display,
        intent.field,
        intent.before !== undefined && intent.before !== intent.field
          ? intent.before
          : undefined
      ).fields

  const nextView = finalizeView(reader, {
    ...view,
    display: {
      fields: nextFields
    }
  })
  return emitValidatedViewUpdate(input, reader, view, nextView)
}

const lowerViewDisplayHide = (
  intent: Extract<Intent, { type: 'view.display.hide' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  if (!requireView(input, reader, intent.id)) {
    return
  }
  if (!reader.fields.has(intent.field)) {
    compileIssue(input, 'field.notFound', `Unknown field: ${intent.field}`, 'field')
    return
  }

  input.program.view.display.delete(intent.id, intent.field)
}

const lowerViewDisplayClear = (
  intent: Extract<Intent, { type: 'view.display.clear' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  view.display.fields.forEach((fieldId) => {
    input.program.view.display.delete(view.id, fieldId)
  })
}

const lowerViewRemove = (
  intent: Extract<Intent, { type: 'view.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextDocument = documentViews.remove(input.document, view.id)
  input.program.view.delete(view.id)
  if (input.document.activeViewId !== nextDocument.activeViewId) {
    input.program.document.patch({
      activeViewId: nextDocument.activeViewId
    })
  }
}

export const compileViewIntent = (
  input: DataviewCompileContext
) => {
  const { intent, reader } = input
  switch (intent.type) {
    case 'view.create':
      return lowerViewCreate(intent, input, reader)
    case 'view.rename':
      return lowerViewRename(intent, input, reader)
    case 'view.type.set':
      return lowerViewTypeSet(intent, input, reader)
    case 'view.search.set':
      return lowerViewSearchSet(intent, input, reader)
    case 'view.filter.create':
      return lowerViewFilterCreate(intent, input, reader)
    case 'view.filter.patch':
      return lowerViewFilterPatch(intent, input, reader)
    case 'view.filter.move':
      return lowerViewFilterMove(intent, input, reader)
    case 'view.filter.mode.set':
      return lowerViewFilterModeSet(intent, input, reader)
    case 'view.filter.remove':
      return lowerViewFilterRemove(intent, input, reader)
    case 'view.filter.clear':
      return lowerViewFilterClear(intent, input, reader)
    case 'view.sort.create':
      return lowerViewSortCreate(intent, input, reader)
    case 'view.sort.patch':
      return lowerViewSortPatch(intent, input, reader)
    case 'view.sort.move':
      return lowerViewSortMove(intent, input, reader)
    case 'view.sort.remove':
      return lowerViewSortRemove(intent, input, reader)
    case 'view.sort.clear':
      return lowerViewSortClear(intent, input, reader)
    case 'view.group.set':
      return lowerViewGroupSet(intent, input, reader)
    case 'view.group.clear':
      return lowerViewGroupClear(intent, input, reader)
    case 'view.group.toggle':
      return lowerViewGroupToggle(intent, input, reader)
    case 'view.group.mode.set':
      return lowerViewGroupModeSet(intent, input, reader)
    case 'view.group.sort.set':
      return lowerViewGroupSortSet(intent, input, reader)
    case 'view.group.interval.set':
      return lowerViewGroupIntervalSet(intent, input, reader)
    case 'view.group.showEmpty.set':
      return lowerViewGroupShowEmptySet(intent, input, reader)
    case 'view.section.show':
    case 'view.section.hide':
    case 'view.section.collapse':
    case 'view.section.expand':
      return lowerViewSectionVisibility(intent, input, reader)
    case 'view.calc.set':
      return lowerViewCalcSet(intent, input, reader)
    case 'view.table.widths.set':
      return lowerViewTableWidthsSet(intent, input, reader)
    case 'view.table.verticalLines.set':
      return lowerViewTableVerticalLinesSet(intent, input, reader)
    case 'view.table.wrap.set':
      return lowerViewTableWrapSet(intent, input, reader)
    case 'view.gallery.wrap.set':
      return lowerViewGalleryWrapSet(intent, input, reader)
    case 'view.gallery.size.set':
      return lowerViewGallerySizeSet(intent, input, reader)
    case 'view.gallery.layout.set':
      return lowerViewGalleryLayoutSet(intent, input, reader)
    case 'view.kanban.wrap.set':
      return lowerViewKanbanWrapSet(intent, input, reader)
    case 'view.kanban.size.set':
      return lowerViewKanbanSizeSet(intent, input, reader)
    case 'view.kanban.layout.set':
      return lowerViewKanbanLayoutSet(intent, input, reader)
    case 'view.kanban.fillColor.set':
      return lowerViewKanbanFillColorSet(intent, input, reader)
    case 'view.kanban.cardsPerColumn.set':
      return lowerViewKanbanCardsPerColumnSet(intent, input, reader)
    case 'view.order.move':
      return lowerViewOrderMove(intent, input, reader)
    case 'view.order.splice':
      return lowerViewOrderSplice(intent, input, reader)
    case 'view.display.move':
      return lowerViewDisplayMove(intent, input, reader)
    case 'view.display.splice':
      return lowerViewDisplaySplice(intent, input, reader)
    case 'view.display.show':
      return lowerViewDisplayShow(intent, input, reader)
    case 'view.display.hide':
      return lowerViewDisplayHide(intent, input, reader)
    case 'view.display.clear':
      return lowerViewDisplayClear(intent, input, reader)
    case 'view.open':
      return lowerViewOpen(intent, input, reader)
    case 'view.remove':
      return lowerViewRemove(intent, input, reader)
    default:
      throw new Error(`Unsupported view intent: ${intent.type}`)
  }
}

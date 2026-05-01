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
import type {
  DataviewCompileContext
} from './contracts'
import type {
  DataviewCompileReader
} from './reader'
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

type DataviewCompileInput = DataviewCompileContext
type DocumentReader = DataviewCompileReader
type ViewIntentType = Extract<Intent['type'], `view.${string}`>
type TypedView<TType extends View['type']> = Extract<View, { type: TType }>
type ViewIntent = Extract<Intent, { type: ViewIntentType }>
type ExistingViewIntent = Extract<ViewIntent, { id: ViewId }>
type ExistingViewContext<TIntent extends ExistingViewIntent = ExistingViewIntent> =
  DataviewCompileContext<TIntent>
type DataviewViewIntentHandlers = {
  [K in ViewIntentType]: (
    input: DataviewCompileContext<Extract<Intent, { type: K }>>
  ) => void
}

const readErrorMessage = (
  error: unknown,
  fallback: string
): string => error instanceof Error
  ? error.message
  : fallback

const toBeforeAnchor = (
  before?: string
) => before === undefined
  ? undefined
  : {
      kind: 'before' as const,
      itemId: before
    }

const reportSemanticError = (
  input: DataviewCompileContext,
  error: unknown,
  path: string
) => {
  input.issue({
    source: input.source,
    code: 'view.invalidProjection',
    message: readErrorMessage(error, 'Invalid view operation.'),
    path,
    severity: 'error'
  })
}

const emitProblem = (
  input: DataviewCompileContext,
  code: ValidationIssue['code'],
  message: string,
  path?: string
) => {
  input.issue({
    source: input.source,
    code,
    message,
    ...(path === undefined ? {} : { path }),
    severity: 'error'
  })
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

const createValidationIssue = (
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
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'field id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(fieldId)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Duplicate field id: ${fieldId}`, `${path}.${index}`))
      return
    }
    seen.add(fieldId)
    if (!reader.fields.has(fieldId)) {
      issues.push(createValidationIssue(source, 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${index}`))
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
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
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
  viewApi.filter.rules.read.list(filter.rules).forEach((rule, index) => {
    if (!string.isNonEmptyString(rule.fieldId)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Filter field id must be a non-empty string (${rule.id})`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!string.isNonEmptyString(rule.presetId)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Filter preset id must be a non-empty string (${rule.id})`, `${path}.rules.${index}.presetId`))
      return
    }
    const field = reader.fields.get(rule.fieldId)
    if (!field) {
      issues.push(createValidationIssue(source, 'field.notFound', `Unknown field: ${rule.fieldId} (${rule.id})`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!viewApi.filter.rule.hasPreset(field, rule.presetId)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Filter preset ${rule.presetId} is invalid for ${field.kind} fields (${rule.id})`, `${path}.rules.${index}.presetId`))
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
  viewApi.sort.rules.read.list(sort.rules).forEach((rule, index) => {
    if (!string.isNonEmptyString(rule.fieldId)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Sort field must be a non-empty string (${rule.id})`, `${path}.rules.${index}.fieldId`))
    } else if (!reader.fields.has(rule.fieldId)) {
      issues.push(createValidationIssue(source, 'field.notFound', `Unknown field: ${rule.fieldId} (${rule.id})`, `${path}.rules.${index}.fieldId`))
    } else if (seen.has(rule.fieldId)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Duplicate sort field: ${rule.fieldId} (${rule.id})`, `${path}.rules.${index}.fieldId`))
    } else {
      seen.add(rule.fieldId)
    }

    if (rule.direction !== 'asc' && rule.direction !== 'desc') {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Sort direction must be asc or desc (${rule.id})`, `${path}.rules.${index}.direction`))
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
    : [createValidationIssue(source, 'view.invalidProjection', 'group field must be a non-empty string', `${path}.fieldId`)]

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
    issues.push(createValidationIssue(source, 'field.notFound', `Unknown field: ${group.fieldId}`, `${path}.fieldId`))
  }
  if (!string.isNonEmptyString(group.mode)) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (field && (!fieldGroupMeta?.modes.length || !fieldGroupMeta.modes.includes(group.mode))) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }
  if (!fieldApi.group.sort.isBucket(group.bucketSort)) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'group bucketSort is invalid', `${path}.bucketSort`))
  } else if (field && !fieldGroupMetaForMode?.sorts.includes(group.bucketSort)) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'group bucketSort is invalid for this field', `${path}.bucketSort`))
  }
  if (group.bucketInterval !== undefined) {
    if (typeof group.bucketInterval !== 'number' || !Number.isFinite(group.bucketInterval) || group.bucketInterval <= 0) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'group bucketInterval must be a positive finite number', `${path}.bucketInterval`))
    } else if (field && !fieldGroupMetaForMode?.supportsInterval) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'group bucketInterval is invalid for this field', `${path}.bucketInterval`))
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
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'width field id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!reader.fields.has(fieldId)) {
      issues.push(createValidationIssue(source, 'field.notFound', `Unknown field: ${fieldId}`, `${path}.widths.${fieldId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${fieldId}`))
    }
  })
  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }
  if (typeof table.wrap !== 'boolean') {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'table.wrap must be boolean', `${path}.wrap`))
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
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'gallery.card.wrap must be boolean', `${path}.card.wrap`))
  }
  if (!['sm', 'md', 'lg'].includes(gallery.card.size)) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'gallery.card.size is invalid', `${path}.card.size`))
  }
  if (gallery.card.layout !== 'compact' && gallery.card.layout !== 'stacked') {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'gallery.card.layout is invalid', `${path}.card.layout`))
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
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'kanban.card.wrap must be boolean', `${path}.card.wrap`))
  }
  if (!['sm', 'md', 'lg'].includes(kanban.card.size)) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'kanban.card.size is invalid', `${path}.card.size`))
  }
  if (kanban.card.layout !== 'compact' && kanban.card.layout !== 'stacked') {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'kanban.card.layout is invalid', `${path}.card.layout`))
  }
  if (typeof kanban.fillColumnColor !== 'boolean') {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', `${path}.fillColumnColor`))
  }
  if (!KANBAN_CARDS_PER_COLUMN_OPTIONS.includes(kanban.cardsPerColumn)) {
    issues.push(createValidationIssue(source, 'view.invalidProjection', 'kanban.cardsPerColumn is invalid', `${path}.cardsPerColumn`))
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
      issues.push(createValidationIssue(source, 'view.invalidOrder', 'orders must only contain non-empty record ids', `${path}.${index}`))
      return
    }
    if (seen.has(recordId)) {
      issues.push(createValidationIssue(source, 'view.invalidOrder', `Duplicate record id: ${recordId}`, `${path}.${index}`))
      return
    }
    seen.add(recordId)
    if (!reader.records.has(recordId)) {
      issues.push(createValidationIssue(source, 'record.notFound', `Unknown record: ${recordId}`, `${path}.${index}`))
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
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'Calculation field must be a non-empty string', path))
      return
    }
    const field = reader.fields.get(fieldId as FieldId)
    if (!field) {
      issues.push(createValidationIssue(source, 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${fieldId}`))
      return
    }
    if (!calculation.metric.is(metric)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', 'Calculation metric is invalid', `${path}.${fieldId}`))
      return
    }
    if (!calculation.metric.supports(field, metric)) {
      issues.push(createValidationIssue(source, 'view.invalidProjection', `Calculation metric ${metric} is invalid for ${field.kind} fields`, `${path}.${fieldId}`))
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
    issues.push(createValidationIssue(source, 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!string.isNonEmptyString(view.name)) {
    issues.push(createValidationIssue(source, 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!string.isNonEmptyString(view.type)) {
    issues.push(createValidationIssue(source, 'view.invalid', 'View type must be a non-empty string', 'view.type'))
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
        rules: viewApi.sort.rules.read.normalize(view.sort.rules)
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
  current: View,
  next: View,
  data?: T
) => {
  if (equal.sameJsonValue(current, next)) {
    return undefined
  }

  input.issue(...validateView(input.reader, input.source, next))
  writeViewUpdate(input.program, current, next)
  if (data !== undefined) {
    input.output(data)
  }
  return data
}

const updateExistingView = <TIntent extends ExistingViewIntent, TOutput = unknown>(
  input: ExistingViewContext<TIntent>,
  build: (view: View) => View | undefined,
  data?: TOutput
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextView = build(view)
  if (!nextView) {
    return
  }

  return emitValidatedViewUpdate(input, view, nextView, data)
}

const patchGroupedView = <TIntent extends ExistingViewIntent>(
  input: ExistingViewContext<TIntent>,
  path: string,
  message: string,
  build: (view: View, field: Field) => ViewGroup | undefined
) => updateExistingView(input, (view) => {
  const field = requireGroupedField(input, view)
  if (!field) {
    return undefined
  }

  const nextGroup = build(view, field)
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', message, path)
    return undefined
  }

  return finalizeView(input.reader, {
    ...view,
    group: nextGroup
  })
})

const patchTypedViewOptions = <
  TType extends View['type'],
  TIntent extends ExistingViewIntent
>(
  input: ExistingViewContext<TIntent>,
  viewType: TType,
  invalidInputMessage: string,
  invalidOutputMessage: string,
  buildOptions: (view: TypedView<TType>) => TypedView<TType>['options']
) => updateExistingView(input, (view) => {
  if (view.type !== viewType) {
    emitProblem(input, 'view.invalidProjection', invalidInputMessage, 'id')
    return undefined
  }

  const typedView = view as TypedView<TType>
  const nextView = finalizeView(input.reader, {
    ...typedView,
    options: buildOptions(typedView)
  })

  if (nextView.type !== viewType) {
    emitProblem(input, 'view.invalidProjection', invalidOutputMessage, 'id')
    return undefined
  }

  return nextView
})

const createViewUpdateHandler = <
  TIntent extends ExistingViewIntent
>(
  build: (
    input: ExistingViewContext<TIntent>,
    view: View
  ) => View | undefined
): ((input: ExistingViewContext<TIntent>) => void) => (
  input
) => {
  updateExistingView(input, (view) => build(input, view))
}

const createGroupedViewHandler = <
  TIntent extends ExistingViewIntent
>(
  path: string,
  message: string,
  build: (
    input: ExistingViewContext<TIntent>,
    view: View,
    field: Field
  ) => ViewGroup | undefined
): ((input: ExistingViewContext<TIntent>) => void) => (
  input
) => {
  patchGroupedView(
    input,
    path,
    message,
    (view, field) => build(input, view, field)
  )
}

const createTypedViewOptionsHandler = <
  TType extends View['type'],
  TIntent extends ExistingViewIntent
>(
  viewType: TType,
  invalidInputMessage: string,
  invalidOutputMessage: string,
  buildOptions: (
    input: ExistingViewContext<TIntent>,
    view: TypedView<TType>
  ) => TypedView<TType>['options']
): ((input: ExistingViewContext<TIntent>) => void) => (
  input
) => {
  patchTypedViewOptions(
    input,
    viewType,
    invalidInputMessage,
    invalidOutputMessage,
    (view) => buildOptions(input, view)
  )
}

const requireView = (
  input: DataviewCompileInput,
  viewId: ViewId
) => input.reader.views.require(viewId, 'id')

const requireField = (
  input: DataviewCompileInput,
  fieldId: FieldId,
  path = 'fieldId'
): Field | undefined => input.reader.fields.require(fieldId, path)

const requireGroupedField = (
  input: DataviewCompileInput,
  view: View
): Field | undefined => {
  const fieldId = view.group?.fieldId
  return fieldId
    ? requireField(input, fieldId, 'fieldId')
    : (emitProblem(
        input,
        'view.invalidProjection',
        'View is not grouped.',
        'id'
      ), undefined)
}

const lowerViewCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.create' }>>
) => {
  const { intent } = input
  const { reader } = input
  const explicitViewId = string.trimToUndefined(intent.input.id)
  const preferredName = string.trimToUndefined(intent.input.name) ?? ''

  if (intent.input.id !== undefined && !explicitViewId) {
    emitProblem(input, 'view.invalid', 'View id must be a non-empty string', 'input.id')
  }
  if (explicitViewId && reader.views.has(explicitViewId)) {
    emitProblem(input, 'view.invalid', `View already exists: ${explicitViewId}`, 'input.id')
  }
  if (!preferredName) {
    emitProblem(input, 'view.invalid', 'View name must be a non-empty string', 'input.name')
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
        emitProblem(input, 'view.invalidProjection', 'Kanban view requires a groupable field', 'input.group')
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
  input.issue(...validateView(reader, input.source, view))
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

const handleViewRename: DataviewViewIntentHandlers['view.rename'] = createViewUpdateHandler(
  (input, view) => {
    const name = string.trimToUndefined(input.intent.name)
    if (!name) {
      emitProblem(input, 'view.invalid', 'View name must be a non-empty string', 'name')
      return undefined
    }

    return finalizeView(input.reader, {
      ...view,
      name
    })
  }
)

const handleViewTypeSet: DataviewViewIntentHandlers['view.type.set'] = createViewUpdateHandler(
  (input, view) => {
    const nextCandidate = setViewType({
      view,
      type: input.intent.viewType,
      fields: input.reader.fields.list()
    })
    if (!nextCandidate) {
      emitProblem(input, 'view.invalidProjection', 'Kanban view requires a groupable field', 'viewType')
      return undefined
    }

    return finalizeView(input.reader, nextCandidate)
  }
)

const handleViewSearchSet: DataviewViewIntentHandlers['view.search.set'] = createViewUpdateHandler(
  (input, view) => finalizeView(input.reader, {
    ...view,
    search: viewApi.search.state.clone(input.intent.search)
  })
)

const handleViewFilterModeSet: DataviewViewIntentHandlers['view.filter.mode.set'] = createViewUpdateHandler(
  (input, view) => finalizeView(input.reader, {
    ...view,
    filter: viewApi.filter.state.write.mode(view.filter, input.intent.mode)
  })
)

const handleViewFilterClear: DataviewViewIntentHandlers['view.filter.clear'] = createViewUpdateHandler(
  (input, view) => finalizeView(input.reader, {
    ...view,
    filter: viewApi.filter.rules.write.clear(view.filter)
  })
)

const handleViewSortClear: DataviewViewIntentHandlers['view.sort.clear'] = createViewUpdateHandler(
  (input, view) => finalizeView(input.reader, {
    ...view,
    sort: viewApi.sort.rules.write.clear(view.sort)
  })
)

const handleViewGroupSet: DataviewViewIntentHandlers['view.group.set'] = createViewUpdateHandler(
  (input, view) => finalizeView(input.reader, {
    ...view,
    group: viewApi.group.state.clone(input.intent.group)
  } as View)
)

const handleViewGroupClear: DataviewViewIntentHandlers['view.group.clear'] = createViewUpdateHandler(
  (input, view) => finalizeView(input.reader, {
    ...view,
    group: viewApi.group.write.clear(view.group)
  } as View)
)

const handleViewGroupToggle: DataviewViewIntentHandlers['view.group.toggle'] = (
  input
) => {
  const field = requireField(input, input.intent.field, 'field')
  if (!field) {
    return
  }

  updateExistingView(input, (view) => finalizeView(input.reader, {
    ...view,
    group: viewApi.group.write.toggle(view.group, field)
  } as View))
}

const handleViewGroupModeSet: DataviewViewIntentHandlers['view.group.mode.set'] = createGroupedViewHandler(
  'mode',
  'Unable to update group mode.',
  (input, view, field) => viewApi.group.write.update(view.group, field, {
    mode: input.intent.mode
  })
)

const handleViewGroupSortSet: DataviewViewIntentHandlers['view.group.sort.set'] = createGroupedViewHandler(
  'sort',
  'Unable to update group sort.',
  (input, view, field) => viewApi.group.write.update(view.group, field, {
    bucketSort: input.intent.sort
  })
)

const handleViewGroupIntervalSet: DataviewViewIntentHandlers['view.group.interval.set'] = createGroupedViewHandler(
  'interval',
  'Unable to update group interval.',
  (input, view, field) => viewApi.group.write.update(view.group, field, {
    bucketInterval: input.intent.interval
  })
)

const handleViewGroupShowEmptySet: DataviewViewIntentHandlers['view.group.showEmpty.set'] = createGroupedViewHandler(
  'value',
  'Unable to update group empty-bucket visibility.',
  (input, view, field) => viewApi.group.write.update(view.group, field, {
    showEmpty: input.intent.value
  })
)

const handleViewSectionShow: DataviewViewIntentHandlers['view.section.show'] = createGroupedViewHandler(
  'bucket',
  'Unable to update group section state.',
  (input, view, field) => viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      hidden: false
    }
  )
)

const handleViewSectionHide: DataviewViewIntentHandlers['view.section.hide'] = createGroupedViewHandler(
  'bucket',
  'Unable to update group section state.',
  (input, view, field) => viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      hidden: true
    }
  )
)

const handleViewSectionCollapse: DataviewViewIntentHandlers['view.section.collapse'] = createGroupedViewHandler(
  'bucket',
  'Unable to update group section state.',
  (input, view, field) => viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      collapsed: true
    }
  )
)

const handleViewSectionExpand: DataviewViewIntentHandlers['view.section.expand'] = createGroupedViewHandler(
  'bucket',
  'Unable to update group section state.',
  (input, view, field) => viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      collapsed: false
    }
  )
)

const handleViewCalcSet: DataviewViewIntentHandlers['view.calc.set'] = (
  input
) => {
  if (!requireField(input, input.intent.field, 'field')) {
    return
  }

  updateExistingView(input, (view) => finalizeView(input.reader, {
    ...view,
    calc: viewApi.calc.set(view.calc, input.intent.field, input.intent.metric ?? null)
  }))
}

const handleViewTableWidthsSet: DataviewViewIntentHandlers['view.table.widths.set'] = createTypedViewOptionsHandler(
  'table',
  'view.table.widths.set requires a table view',
  'view.table.widths.set produced a non-table view',
  (input, view) => viewApi.layout.table.patch(view.options, {
    widths: input.intent.widths
  })
)

const handleViewTableVerticalLinesSet: DataviewViewIntentHandlers['view.table.verticalLines.set'] = createTypedViewOptionsHandler(
  'table',
  'view.table.verticalLines.set requires a table view',
  'view.table.verticalLines.set produced a non-table view',
  (input, view) => viewApi.layout.table.patch(view.options, {
    showVerticalLines: input.intent.value
  })
)

const handleViewTableWrapSet: DataviewViewIntentHandlers['view.table.wrap.set'] = createTypedViewOptionsHandler(
  'table',
  'view.table.wrap.set requires a table view',
  'view.table.wrap.set produced a non-table view',
  (input, view) => viewApi.layout.table.patch(view.options, {
    wrap: input.intent.value
  })
)

const handleViewGalleryWrapSet: DataviewViewIntentHandlers['view.gallery.wrap.set'] = createTypedViewOptionsHandler(
  'gallery',
  'view.gallery.wrap.set requires a gallery view',
  'view.gallery.wrap.set produced a non-gallery view',
  (input, view) => viewApi.layout.gallery.patch(view.options, {
    card: {
      wrap: input.intent.value
    }
  })
)

const handleViewGallerySizeSet: DataviewViewIntentHandlers['view.gallery.size.set'] = createTypedViewOptionsHandler(
  'gallery',
  'view.gallery.size.set requires a gallery view',
  'view.gallery.size.set produced a non-gallery view',
  (input, view) => viewApi.layout.gallery.patch(view.options, {
    card: {
      size: input.intent.value
    }
  })
)

const handleViewGalleryLayoutSet: DataviewViewIntentHandlers['view.gallery.layout.set'] = createTypedViewOptionsHandler(
  'gallery',
  'view.gallery.layout.set requires a gallery view',
  'view.gallery.layout.set produced a non-gallery view',
  (input, view) => viewApi.layout.gallery.patch(view.options, {
    card: {
      layout: input.intent.value
    }
  })
)

const handleViewKanbanWrapSet: DataviewViewIntentHandlers['view.kanban.wrap.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.wrap.set requires a kanban view',
  'view.kanban.wrap.set produced a non-kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    card: {
      wrap: input.intent.value
    }
  })
)

const handleViewKanbanSizeSet: DataviewViewIntentHandlers['view.kanban.size.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.size.set requires a kanban view',
  'view.kanban.size.set produced a non-kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    card: {
      size: input.intent.value
    }
  })
)

const handleViewKanbanLayoutSet: DataviewViewIntentHandlers['view.kanban.layout.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.layout.set requires a kanban view',
  'view.kanban.layout.set produced a non-kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    card: {
      layout: input.intent.value
    }
  })
)

const handleViewKanbanFillColorSet: DataviewViewIntentHandlers['view.kanban.fillColor.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.fillColor.set requires a kanban view',
  'view.kanban.fillColor.set produced a non-kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    fillColumnColor: input.intent.value
  })
)

const handleViewKanbanCardsPerColumnSet: DataviewViewIntentHandlers['view.kanban.cardsPerColumn.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.cardsPerColumn.set requires a kanban view',
  'view.kanban.cardsPerColumn.set produced a non-kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    cardsPerColumn: input.intent.value
  })
)

const lowerViewFilterCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.create' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  const field = requireField(input, intent.input.fieldId, 'input.fieldId')
  if (!view || !field) {
    return
  }

  const explicitRuleId = intent.input.id === undefined
    ? undefined
    : string.trimToUndefined(intent.input.id)
  if (intent.input.id !== undefined && !explicitRuleId) {
    emitProblem(input, 'view.invalidProjection', 'Filter rule id must be a non-empty string', 'input.id')
    return
  }

  try {
    const created = viewApi.filter.rules.write.insert(view.filter, field, {
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
      emitProblem(input, 'view.invalidProjection', `Unable to create filter rule ${created.id}`, 'input')
      return
    }

    return emitValidatedViewUpdate(input, view, nextView, {
      id: created.id
    })
  } catch (error) {
    reportSemanticError(input, error, 'input')
  }
}

const lowerViewFilterPatch = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.patch' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  const currentRule = view.filter.rules.byId[intent.rule]
  if (!currentRule) {
    emitProblem(input, 'view.invalidProjection', `Unknown filter rule: ${intent.rule}`, 'rule')
    return
  }

  const nextFieldId = intent.patch.fieldId ?? currentRule.fieldId
  const field = requireField(input, nextFieldId, 'patch.fieldId')
  if (!field) {
    return
  }

  try {
    const nextFilter = viewApi.filter.rules.write.patch(
      view.filter,
      intent.rule,
      intent.patch,
      field
    )
    const nextView = finalizeView(reader, {
      ...view,
      filter: nextFilter
    })
    return emitValidatedViewUpdate(input, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'patch')
  }
}

const lowerViewFilterMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.move' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  try {
    const nextFilter = viewApi.filter.rules.write.move(
      view.filter,
      intent.rule,
      intent.before
    )
    const nextView = finalizeView(reader, {
      ...view,
      filter: nextFilter
    })
    return emitValidatedViewUpdate(input, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewFilterRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.remove' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  try {
    const nextView = finalizeView(reader, {
      ...view,
      filter: viewApi.filter.rules.write.remove(view.filter, intent.rule)
    })
    return emitValidatedViewUpdate(input, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewSortCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.create' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  if (!requireField(input, intent.input.fieldId, 'input.fieldId')) {
    return
  }

  const explicitRuleId = intent.input.id === undefined
    ? undefined
    : string.trimToUndefined(intent.input.id)
  if (intent.input.id !== undefined && !explicitRuleId) {
    emitProblem(input, 'view.invalidProjection', 'Sort rule id must be a non-empty string', 'input.id')
    return
  }

  try {
    const created = viewApi.sort.rules.write.insert(view.sort, {
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
      emitProblem(input, 'view.invalidProjection', `Unable to create sort rule ${created.id}`, 'input')
      return
    }

    return emitValidatedViewUpdate(input, view, nextView, {
      id: created.id
    })
  } catch (error) {
    reportSemanticError(input, error, 'input')
  }
}

const lowerViewSortPatch = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.patch' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  if (intent.patch.fieldId && !requireField(input, intent.patch.fieldId, 'patch.fieldId')) {
    return
  }

  try {
    const nextSort = viewApi.sort.rules.write.patch(
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
      emitProblem(input, 'view.invalidProjection', `Unknown sort rule: ${intent.rule}`, 'rule')
      return
    }

    return emitValidatedViewUpdate(input, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'patch')
  }
}

const lowerViewSortMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.move' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  try {
    const nextSort = viewApi.sort.rules.write.move(
      view.sort,
      intent.rule,
      intent.before
    )
    const nextView = finalizeView(reader, {
      ...view,
      sort: nextSort
    })
    return emitValidatedViewUpdate(input, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewSortRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.remove' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  try {
    const nextView = finalizeView(reader, {
      ...view,
      sort: viewApi.sort.rules.write.remove(view.sort, intent.rule)
    })
    return emitValidatedViewUpdate(input, view, nextView)
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewOpen = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.open' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  input.program.document.patch({
    activeViewId: view.id
  })
}

const lowerViewOrderMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.order.move' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  const recordId = string.trimToUndefined(intent.record)
  if (!recordId) {
    emitProblem(input, 'view.invalidOrder', 'view.order.move requires a non-empty record id', 'record')
    return
  }
  if (!reader.records.has(recordId)) {
    emitProblem(input, 'record.notFound', `Unknown record: ${recordId}`, 'record')
    return
  }

  const beforeRecordId = string.trimToUndefined(intent.before)
  if (beforeRecordId !== undefined && beforeRecordId !== recordId && !reader.records.has(beforeRecordId)) {
    emitProblem(input, 'record.notFound', `Unknown record: ${beforeRecordId}`, 'before')
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
  return emitValidatedViewUpdate(input, view, nextView)
}

const lowerViewOrderSplice = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.order.splice' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  const recordIds = Array.from(new Set(
    intent.records
      .map((recordId) => string.trimToUndefined(recordId))
      .filter((recordId): recordId is RecordId => Boolean(recordId))
  ))
  if (!recordIds.length) {
    emitProblem(input, 'view.invalidOrder', 'view.order.splice requires at least one record id', 'records')
    return
  }
  if (recordIds.some((recordId) => !reader.records.has(recordId))) {
    const missing = recordIds.find((recordId) => !reader.records.has(recordId))
    emitProblem(input, 'record.notFound', `Unknown record: ${missing}`, 'records')
    return
  }

  const beforeRecordId = string.trimToUndefined(intent.before)
  if (beforeRecordId !== undefined && !reader.records.has(beforeRecordId)) {
    emitProblem(input, 'record.notFound', `Unknown record: ${beforeRecordId}`, 'before')
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
  return emitValidatedViewUpdate(input, view, nextView)
}

const lowerViewDisplayMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.display.move' }>>
) => {
  const { intent } = input
  if (!requireView(input, intent.id)) {
    return
  }
  if (!requireField(input, intent.field, 'field')) {
    return
  }

  input.program.viewDisplay(intent.id).move(
    intent.field,
    intent.before !== undefined && intent.before !== intent.field
      ? toBeforeAnchor(intent.before)
      : undefined
  )
}

const lowerViewDisplaySplice = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.display.splice' }>>
) => {
  const { intent } = input
  const { reader } = input
  if (!requireView(input, intent.id)) {
    return
  }

  const fieldIds = Array.from(new Set(intent.fields))
  if (!fieldIds.length) {
    emitProblem(input, 'view.invalidProjection', 'view.display.splice requires at least one field id', 'fields')
    return
  }
  if (fieldIds.some((fieldId) => !reader.fields.has(fieldId))) {
    const missing = fieldIds.find((fieldId) => !reader.fields.has(fieldId))
    emitProblem(input, 'field.notFound', `Unknown field: ${missing}`, 'fields')
    return
  }

  input.program.viewDisplay(intent.id).splice(
    fieldIds,
    intent.before !== undefined
      ? toBeforeAnchor(intent.before)
      : undefined
  )
}

const lowerViewDisplayShow = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.display.show' }>>
) => {
  const { intent } = input
  const { reader } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }
  if (!requireField(input, intent.field, 'field')) {
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
  return emitValidatedViewUpdate(input, view, nextView)
}

const lowerViewDisplayHide = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.display.hide' }>>
) => {
  const { intent } = input
  if (!requireView(input, intent.id)) {
    return
  }
  if (!requireField(input, intent.field, 'field')) {
    return
  }

  input.program.viewDisplay(intent.id).delete(intent.field)
}

const lowerViewDisplayClear = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.display.clear' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  view.display.fields.forEach((fieldId) => {
    input.program.viewDisplay(view.id).delete(fieldId)
  })
}

const lowerViewRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.remove' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
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

export const dataviewViewIntentHandlers: DataviewViewIntentHandlers = {
  'view.create': lowerViewCreate,
  'view.rename': handleViewRename,
  'view.type.set': handleViewTypeSet,
  'view.search.set': handleViewSearchSet,
  'view.filter.create': lowerViewFilterCreate,
  'view.filter.patch': lowerViewFilterPatch,
  'view.filter.move': lowerViewFilterMove,
  'view.filter.mode.set': handleViewFilterModeSet,
  'view.filter.remove': lowerViewFilterRemove,
  'view.filter.clear': handleViewFilterClear,
  'view.sort.create': lowerViewSortCreate,
  'view.sort.patch': lowerViewSortPatch,
  'view.sort.move': lowerViewSortMove,
  'view.sort.remove': lowerViewSortRemove,
  'view.sort.clear': handleViewSortClear,
  'view.group.set': handleViewGroupSet,
  'view.group.clear': handleViewGroupClear,
  'view.group.toggle': handleViewGroupToggle,
  'view.group.mode.set': handleViewGroupModeSet,
  'view.group.sort.set': handleViewGroupSortSet,
  'view.group.interval.set': handleViewGroupIntervalSet,
  'view.group.showEmpty.set': handleViewGroupShowEmptySet,
  'view.section.show': handleViewSectionShow,
  'view.section.hide': handleViewSectionHide,
  'view.section.collapse': handleViewSectionCollapse,
  'view.section.expand': handleViewSectionExpand,
  'view.calc.set': handleViewCalcSet,
  'view.table.widths.set': handleViewTableWidthsSet,
  'view.table.verticalLines.set': handleViewTableVerticalLinesSet,
  'view.table.wrap.set': handleViewTableWrapSet,
  'view.gallery.wrap.set': handleViewGalleryWrapSet,
  'view.gallery.size.set': handleViewGallerySizeSet,
  'view.gallery.layout.set': handleViewGalleryLayoutSet,
  'view.kanban.wrap.set': handleViewKanbanWrapSet,
  'view.kanban.size.set': handleViewKanbanSizeSet,
  'view.kanban.layout.set': handleViewKanbanLayoutSet,
  'view.kanban.fillColor.set': handleViewKanbanFillColorSet,
  'view.kanban.cardsPerColumn.set': handleViewKanbanCardsPerColumnSet,
  'view.order.move': lowerViewOrderMove,
  'view.order.splice': lowerViewOrderSplice,
  'view.display.move': lowerViewDisplayMove,
  'view.display.splice': lowerViewDisplaySplice,
  'view.display.show': lowerViewDisplayShow,
  'view.display.hide': lowerViewDisplayHide,
  'view.display.clear': lowerViewDisplayClear,
  'view.open': lowerViewOpen,
  'view.remove': lowerViewRemove
}

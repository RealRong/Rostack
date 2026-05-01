import type {
  Field,
  FieldId,
  FilterRule,
  Intent,
  RecordId,
  SortRule,
  View,
  ViewGroup,
  ViewId,
} from '@dataview/core/types'
import {
  view as viewApi
} from '@dataview/core/view'
import {
  createId,
  entityTable,
  equal,
  string
} from '@shared/core'
import type {
  DataviewCompileContext,
  ValidationCode
} from './contracts'
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
} from '../../view/model/update'

type DataviewCompileInput = DataviewCompileContext
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
  code: ValidationCode,
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

const emitViewUpdate = <T,>(
  input: DataviewCompileInput,
  current: View,
  next: View,
  data?: T
) => {
  if (equal.sameJsonValue(current, next)) {
    return undefined
  }

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

  return emitViewUpdate(input, view, nextView, data)
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

  return {
    ...view,
    group: nextGroup
  }
})

const patchTypedViewOptions = <
  TType extends View['type'],
  TIntent extends ExistingViewIntent
>(
  input: ExistingViewContext<TIntent>,
  viewType: TType,
  invalidInputMessage: string,
  buildOptions: (view: TypedView<TType>) => TypedView<TType>['options']
) => updateExistingView(input, (view) => {
  if (view.type !== viewType) {
    emitProblem(input, 'view.invalidProjection', invalidInputMessage, 'id')
    return undefined
  }

  const typedView = view as TypedView<TType>
  const nextView = {
    ...typedView,
    options: buildOptions(typedView)
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

  const view = created
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

    return {
      ...view,
      name
    }
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

    return nextCandidate
  }
)

const handleViewSearchSet: DataviewViewIntentHandlers['view.search.set'] = createViewUpdateHandler(
  (input, view) => ({
    ...view,
    search: viewApi.search.state.clone(input.intent.search)
  })
)

const handleViewFilterModeSet: DataviewViewIntentHandlers['view.filter.mode.set'] = createViewUpdateHandler(
  (input, view) => ({
    ...view,
    filter: viewApi.filter.state.write.mode(view.filter, input.intent.mode)
  })
)

const handleViewFilterClear: DataviewViewIntentHandlers['view.filter.clear'] = createViewUpdateHandler(
  (input, view) => ({
    ...view,
    filter: viewApi.filter.rules.write.clear(view.filter)
  })
)

const handleViewSortClear: DataviewViewIntentHandlers['view.sort.clear'] = createViewUpdateHandler(
  (input, view) => ({
    ...view,
    sort: viewApi.sort.rules.write.clear(view.sort)
  })
)

const handleViewGroupSet: DataviewViewIntentHandlers['view.group.set'] = createViewUpdateHandler(
  (input, view) => ({
    ...view,
    group: viewApi.group.state.clone(input.intent.group)
  } as View)
)

const handleViewGroupClear: DataviewViewIntentHandlers['view.group.clear'] = createViewUpdateHandler(
  (input, view) => ({
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

  updateExistingView(input, (view) => ({
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

  updateExistingView(input, (view) => ({
    ...view,
    calc: viewApi.calc.set(view.calc, input.intent.field, input.intent.metric ?? null)
  }))
}

const handleViewTableWidthsSet: DataviewViewIntentHandlers['view.table.widths.set'] = createTypedViewOptionsHandler(
  'table',
  'view.table.widths.set requires a table view',
  (input, view) => viewApi.layout.table.patch(view.options, {
    widths: input.intent.widths
  })
)

const handleViewTableVerticalLinesSet: DataviewViewIntentHandlers['view.table.verticalLines.set'] = createTypedViewOptionsHandler(
  'table',
  'view.table.verticalLines.set requires a table view',
  (input, view) => viewApi.layout.table.patch(view.options, {
    showVerticalLines: input.intent.value
  })
)

const handleViewTableWrapSet: DataviewViewIntentHandlers['view.table.wrap.set'] = createTypedViewOptionsHandler(
  'table',
  'view.table.wrap.set requires a table view',
  (input, view) => viewApi.layout.table.patch(view.options, {
    wrap: input.intent.value
  })
)

const handleViewGalleryWrapSet: DataviewViewIntentHandlers['view.gallery.wrap.set'] = createTypedViewOptionsHandler(
  'gallery',
  'view.gallery.wrap.set requires a gallery view',
  (input, view) => viewApi.layout.gallery.patch(view.options, {
    card: {
      wrap: input.intent.value
    }
  })
)

const handleViewGallerySizeSet: DataviewViewIntentHandlers['view.gallery.size.set'] = createTypedViewOptionsHandler(
  'gallery',
  'view.gallery.size.set requires a gallery view',
  (input, view) => viewApi.layout.gallery.patch(view.options, {
    card: {
      size: input.intent.value
    }
  })
)

const handleViewGalleryLayoutSet: DataviewViewIntentHandlers['view.gallery.layout.set'] = createTypedViewOptionsHandler(
  'gallery',
  'view.gallery.layout.set requires a gallery view',
  (input, view) => viewApi.layout.gallery.patch(view.options, {
    card: {
      layout: input.intent.value
    }
  })
)

const handleViewKanbanWrapSet: DataviewViewIntentHandlers['view.kanban.wrap.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.wrap.set requires a kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    card: {
      wrap: input.intent.value
    }
  })
)

const handleViewKanbanSizeSet: DataviewViewIntentHandlers['view.kanban.size.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.size.set requires a kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    card: {
      size: input.intent.value
    }
  })
)

const handleViewKanbanLayoutSet: DataviewViewIntentHandlers['view.kanban.layout.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.layout.set requires a kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    card: {
      layout: input.intent.value
    }
  })
)

const handleViewKanbanFillColorSet: DataviewViewIntentHandlers['view.kanban.fillColor.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.fillColor.set requires a kanban view',
  (input, view) => viewApi.layout.kanban.patch(view.options, {
    fillColumnColor: input.intent.value
  })
)

const handleViewKanbanCardsPerColumnSet: DataviewViewIntentHandlers['view.kanban.cardsPerColumn.set'] = createTypedViewOptionsHandler(
  'kanban',
  'view.kanban.cardsPerColumn.set requires a kanban view',
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
    const nextView = {
      ...view,
      filter: created.filter
    }
    const rule = nextView.filter.rules.byId[created.id] ?? created.filter.rules.byId[created.id]
    if (!rule) {
      emitProblem(input, 'view.invalidProjection', `Unable to create filter rule ${created.id}`, 'input')
      return
    }

    return emitViewUpdate(input, view, nextView, {
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
    const nextView = {
      ...view,
      filter: nextFilter
    }
    return emitViewUpdate(input, view, nextView)
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
    const nextView = {
      ...view,
      filter: nextFilter
    }
    return emitViewUpdate(input, view, nextView)
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
    const nextView = {
      ...view,
      filter: viewApi.filter.rules.write.remove(view.filter, intent.rule)
    }
    return emitViewUpdate(input, view, nextView)
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
    const nextView = {
      ...view,
      sort: created.sort
    }
    const rule = nextView.sort.rules.byId[created.id] ?? created.sort.rules.byId[created.id]
    if (!rule) {
      emitProblem(input, 'view.invalidProjection', `Unable to create sort rule ${created.id}`, 'input')
      return
    }

    return emitViewUpdate(input, view, nextView, {
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
    const nextView = {
      ...view,
      sort: nextSort
    }
    const rule = nextView.sort.rules.byId[intent.rule]
    if (!rule) {
      emitProblem(input, 'view.invalidProjection', `Unknown sort rule: ${intent.rule}`, 'rule')
      return
    }

    return emitViewUpdate(input, view, nextView)
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
    const nextView = {
      ...view,
      sort: nextSort
    }
    return emitViewUpdate(input, view, nextView)
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
    const nextView = {
      ...view,
      sort: viewApi.sort.rules.write.remove(view.sort, intent.rule)
    }
    return emitViewUpdate(input, view, nextView)
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
  const nextView = {
    ...view,
    orders: reorderRecordIds(currentOrder, recordId, {
      ...(beforeRecordId !== undefined && beforeRecordId !== recordId
        ? {
            beforeRecordId
          }
        : {})
    })
  }
  return emitViewUpdate(input, view, nextView)
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
  const nextView = {
    ...view,
    orders: spliceRecordIds(currentOrder, recordIds, {
      ...(beforeRecordId !== undefined
        ? {
            beforeRecordId
          }
        : {})
    })
  }
  return emitViewUpdate(input, view, nextView)
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

  const nextView = {
    ...view,
    display: {
      fields: nextFields
    }
  }
  return emitViewUpdate(input, view, nextView)
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

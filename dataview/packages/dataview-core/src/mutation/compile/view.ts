import type {
  Field,
  FieldId,
  Intent,
  RecordId,
  View,
  ViewId,
} from '@dataview/core/types'
import {
  view as viewApi
} from '@dataview/core/view'
import {
  createId,
  equal,
  string
} from '@shared/core'
import type {
  DataviewCompileContext,
  ValidationCode
} from './contracts'
import {
  toAnchor,
} from './helpers'
import {
  documentViews
} from '../../document/views'
import {
  applyRecordOrder,
  readViewOrderIds,
  reorderRecordIds,
  replaceViewOrder,
  spliceRecordIds
} from '../../view/order'
import {
  moveViewFields,
  readViewFieldIds,
} from '../../view/fields'
import {
  resolveDefaultKanbanGroup,
  setViewType
} from '../../view/model/update'

type DataviewCompileInput = DataviewCompileContext
type ViewIntentType = Extract<Intent['type'], `view.${string}`>
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

const reportSemanticError = (
  input: DataviewCompileContext,
  error: unknown,
  path: string
) => {
  input.issue({
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
    code,
    message,
    ...(path === undefined ? {} : { path }),
    severity: 'error'
  })
}

const requireView = (
  input: DataviewCompileInput,
  viewId: ViewId
) => input.query.views.get(viewId)

const requireField = (
  input: DataviewCompileInput,
  fieldId: FieldId,
  path = 'fieldId'
): Field | undefined => input.query.fields.get(fieldId)

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
  const { query: reader } = input
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
      rules: []
    },
    sort: intent.input.sort ?? {
      rules: []
    },
    calc: intent.input.calc ?? {},
    fields: intent.input.fields
      ? viewApi.fields.clone(intent.input.fields)
      : viewApi.options.defaultFields(intent.input.type, fields),
    order: replaceViewOrder([])
  }

  let created: View
  switch (intent.input.type) {
    case 'table':
      created = {
        ...base,
        type: 'table',
        group: intent.input.group
          ? viewApi.group.state.clone(intent.input.group)
          : undefined,
        options: intent.input.options
          ? viewApi.options.clone('table', intent.input.options)
          : viewApi.options.defaults('table', fields)
      }
      break
    case 'gallery':
      created = {
        ...base,
        type: 'gallery',
        group: intent.input.group
          ? viewApi.group.state.clone(intent.input.group)
          : undefined,
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

  const { id: createdViewId, ...createdViewValue } = created
  input.write.views.create(createdViewId, createdViewValue)
  if (input.document.activeViewId === undefined) {
    input.write.activeViewId.set(created.id)
  }
  return {
    id: created.id
  }
}

const handleViewRename: DataviewViewIntentHandlers['view.rename'] = (
  input
) => {
  const name = string.trimToUndefined(input.intent.name)
  if (!name) {
    emitProblem(input, 'view.invalid', 'View name must be a non-empty string', 'name')
    return
  }

  const view = requireView(input, input.intent.id)
  if (!view || view.name === name) {
    return
  }

  input.write.views(view.id).patch({
    name
  })
}

const handleViewTypeSet: DataviewViewIntentHandlers['view.type.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextView = setViewType({
    view,
    type: input.intent.viewType,
    fields: input.query.fields.list()
  })
  if (!nextView) {
    emitProblem(input, 'view.invalidProjection', 'Kanban view requires a groupable field', 'viewType')
    return
  }
  if (nextView === view) {
    return
  }

  const patch: Record<string, unknown> = {
    type: nextView.type,
    options: structuredClone(nextView.options)
  }
  if (!viewApi.group.state.same(view.group, nextView.group)) {
    patch.group = nextView.group
      ? viewApi.group.state.clone(nextView.group)
      : undefined
  }

  input.write.views(view.id).patch(patch)
}

const handleViewSearchSet: DataviewViewIntentHandlers['view.search.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextSearch = viewApi.search.state.clone(input.intent.search)
  if (viewApi.search.state.same(view.search, nextSearch)) {
    return
  }

  input.write.views(view.id).patch({
    search: nextSearch
  })
}

const handleViewFilterModeSet: DataviewViewIntentHandlers['view.filter.mode.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextFilter = viewApi.filter.state.write.mode(view.filter, input.intent.mode)
  if (equal.sameJsonValue(view.filter, nextFilter)) {
    return
  }

  input.write.views(view.id).patch({
    filter: structuredClone(nextFilter)
  })
}

const handleViewFilterClear: DataviewViewIntentHandlers['view.filter.clear'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextFilter = viewApi.filter.rules.write.clear(view.filter)
  if (equal.sameJsonValue(view.filter, nextFilter)) {
    return
  }

  input.write.views(view.id).patch({
    filter: structuredClone(nextFilter)
  })
}

const handleViewSortClear: DataviewViewIntentHandlers['view.sort.clear'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextSort = viewApi.sort.rules.write.clear(view.sort)
  if (equal.sameJsonValue(view.sort, nextSort)) {
    return
  }

  input.write.views(view.id).patch({
    sort: structuredClone(nextSort)
  })
}

const handleViewGroupSet: DataviewViewIntentHandlers['view.group.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextGroup = viewApi.group.state.clone(input.intent.group)
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewGroupClear: DataviewViewIntentHandlers['view.group.clear'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextGroup = viewApi.group.write.clear(view.group)
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewGroupToggle: DataviewViewIntentHandlers['view.group.toggle'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  const field = requireField(input, input.intent.field, 'field')
  if (!view || !field) {
    return
  }

  const nextGroup = viewApi.group.write.toggle(view.group, field)
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewGroupModeSet: DataviewViewIntentHandlers['view.group.mode.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.write.update(view.group, field, {
    mode: input.intent.mode
  })
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group mode.', 'mode')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewGroupSortSet: DataviewViewIntentHandlers['view.group.sort.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.write.update(view.group, field, {
    bucketSort: input.intent.sort
  })
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group sort.', 'sort')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewGroupIntervalSet: DataviewViewIntentHandlers['view.group.interval.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.write.update(view.group, field, {
    bucketInterval: input.intent.interval
  })
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group interval.', 'interval')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewGroupShowEmptySet: DataviewViewIntentHandlers['view.group.showEmpty.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.write.update(view.group, field, {
    showEmpty: input.intent.value
  })
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group empty-bucket visibility.', 'value')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewSectionShow: DataviewViewIntentHandlers['view.section.show'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      hidden: false
    }
  )
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group section state.', 'bucket')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewSectionHide: DataviewViewIntentHandlers['view.section.hide'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      hidden: true
    }
  )
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group section state.', 'bucket')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewSectionCollapse: DataviewViewIntentHandlers['view.section.collapse'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      collapsed: true
    }
  )
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group section state.', 'bucket')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewSectionExpand: DataviewViewIntentHandlers['view.section.expand'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  const field = requireGroupedField(input, view)
  if (!field) {
    return
  }

  const nextGroup = viewApi.group.buckets.write.update(
    view.group,
    field,
    input.intent.bucket,
    {
      collapsed: false
    }
  )
  if (!nextGroup) {
    emitProblem(input, 'view.invalidProjection', 'Unable to update group section state.', 'bucket')
    return
  }
  if (viewApi.group.state.same(view.group, nextGroup)) {
    return
  }

  input.write.views(view.id).patch({
    group: nextGroup
  })
}

const handleViewCalcSet: DataviewViewIntentHandlers['view.calc.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view || !requireField(input, input.intent.field, 'field')) {
    return
  }

  const nextCalc = viewApi.calc.set(view.calc, input.intent.field, input.intent.metric ?? null)
  if (viewApi.calc.same(view.calc, nextCalc)) {
    return
  }

  input.write.views(view.id).patch({
    calc: structuredClone(nextCalc)
  })
}

const handleViewTableWidthsSet: DataviewViewIntentHandlers['view.table.widths.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'table') {
    emitProblem(input, 'view.invalidProjection', 'view.table.widths.set requires a table view', 'id')
    return
  }

  const nextOptions = viewApi.layout.table.patch(view.options, {
    widths: input.intent.widths
  })
  if (viewApi.options.same('table', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewTableVerticalLinesSet: DataviewViewIntentHandlers['view.table.verticalLines.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'table') {
    emitProblem(input, 'view.invalidProjection', 'view.table.verticalLines.set requires a table view', 'id')
    return
  }

  const nextOptions = viewApi.layout.table.patch(view.options, {
    showVerticalLines: input.intent.value
  })
  if (viewApi.options.same('table', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewTableWrapSet: DataviewViewIntentHandlers['view.table.wrap.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'table') {
    emitProblem(input, 'view.invalidProjection', 'view.table.wrap.set requires a table view', 'id')
    return
  }

  const nextOptions = viewApi.layout.table.patch(view.options, {
    wrap: input.intent.value
  })
  if (viewApi.options.same('table', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewGalleryWrapSet: DataviewViewIntentHandlers['view.gallery.wrap.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'gallery') {
    emitProblem(input, 'view.invalidProjection', 'view.gallery.wrap.set requires a gallery view', 'id')
    return
  }

  const nextOptions = viewApi.layout.gallery.patch(view.options, {
    card: {
      wrap: input.intent.value
    }
  })
  if (viewApi.options.same('gallery', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewGallerySizeSet: DataviewViewIntentHandlers['view.gallery.size.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'gallery') {
    emitProblem(input, 'view.invalidProjection', 'view.gallery.size.set requires a gallery view', 'id')
    return
  }

  const nextOptions = viewApi.layout.gallery.patch(view.options, {
    card: {
      size: input.intent.value
    }
  })
  if (viewApi.options.same('gallery', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewGalleryLayoutSet: DataviewViewIntentHandlers['view.gallery.layout.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'gallery') {
    emitProblem(input, 'view.invalidProjection', 'view.gallery.layout.set requires a gallery view', 'id')
    return
  }

  const nextOptions = viewApi.layout.gallery.patch(view.options, {
    card: {
      layout: input.intent.value
    }
  })
  if (viewApi.options.same('gallery', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewKanbanWrapSet: DataviewViewIntentHandlers['view.kanban.wrap.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    emitProblem(input, 'view.invalidProjection', 'view.kanban.wrap.set requires a kanban view', 'id')
    return
  }

  const nextOptions = viewApi.layout.kanban.patch(view.options, {
    card: {
      wrap: input.intent.value
    }
  })
  if (viewApi.options.same('kanban', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewKanbanSizeSet: DataviewViewIntentHandlers['view.kanban.size.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    emitProblem(input, 'view.invalidProjection', 'view.kanban.size.set requires a kanban view', 'id')
    return
  }

  const nextOptions = viewApi.layout.kanban.patch(view.options, {
    card: {
      size: input.intent.value
    }
  })
  if (viewApi.options.same('kanban', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewKanbanLayoutSet: DataviewViewIntentHandlers['view.kanban.layout.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    emitProblem(input, 'view.invalidProjection', 'view.kanban.layout.set requires a kanban view', 'id')
    return
  }

  const nextOptions = viewApi.layout.kanban.patch(view.options, {
    card: {
      layout: input.intent.value
    }
  })
  if (viewApi.options.same('kanban', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewKanbanFillColorSet: DataviewViewIntentHandlers['view.kanban.fillColor.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    emitProblem(input, 'view.invalidProjection', 'view.kanban.fillColor.set requires a kanban view', 'id')
    return
  }

  const nextOptions = viewApi.layout.kanban.patch(view.options, {
    fillColumnColor: input.intent.value
  })
  if (viewApi.options.same('kanban', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const handleViewKanbanCardsPerColumnSet: DataviewViewIntentHandlers['view.kanban.cardsPerColumn.set'] = (
  input
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }
  if (view.type !== 'kanban') {
    emitProblem(input, 'view.invalidProjection', 'view.kanban.cardsPerColumn.set requires a kanban view', 'id')
    return
  }

  const nextOptions = viewApi.layout.kanban.patch(view.options, {
    cardsPerColumn: input.intent.value
  })
  if (viewApi.options.same('kanban', view.options, nextOptions)) {
    return
  }

  input.write.views(view.id).patch({
    options: nextOptions
  })
}

const lowerViewFilterCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.create' }>>
) => {
  const { intent } = input
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
      ...(explicitRuleId !== undefined ? { id: explicitRuleId } : {}),
      ...(intent.input.presetId !== undefined ? { presetId: intent.input.presetId } : {}),
      ...(Object.prototype.hasOwnProperty.call(intent.input, 'value')
        ? { value: intent.input.value }
        : {}),
      ...(intent.before !== undefined ? { before: intent.before } : {})
    })
    if (equal.sameJsonValue(view.filter, created.filter)) {
      return
    }

    input.write.views(view.id).patch({
      filter: structuredClone(created.filter)
    })
    return {
      id: created.id
    }
  } catch (error) {
    reportSemanticError(input, error, 'input')
  }
}

const lowerViewFilterPatch = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.patch' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  const currentRule = view.filter.rules.find((rule) => rule.id === intent.rule)
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
    if (equal.sameJsonValue(view.filter, nextFilter)) {
      return
    }

    input.write.views(view.id).patch({
      filter: structuredClone(nextFilter)
    })
  } catch (error) {
    reportSemanticError(input, error, 'patch')
  }
}

const lowerViewFilterMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.move' }>>
) => {
  const { intent } = input
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
    if (equal.sameJsonValue(view.filter, nextFilter)) {
      return
    }

    input.write.views(view.id).patch({
      filter: structuredClone(nextFilter)
    })
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewFilterRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.filter.remove' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  try {
    const nextFilter = viewApi.filter.rules.write.remove(view.filter, intent.rule)
    if (equal.sameJsonValue(view.filter, nextFilter)) {
      return
    }

    input.write.views(view.id).patch({
      filter: structuredClone(nextFilter)
    })
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewSortCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.create' }>>
) => {
  const { intent } = input
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
      ...(explicitRuleId !== undefined ? { id: explicitRuleId } : {}),
      fieldId: intent.input.fieldId,
      ...(intent.input.direction !== undefined ? { direction: intent.input.direction } : {}),
      ...(intent.before !== undefined ? { before: intent.before } : {})
    })
    if (equal.sameJsonValue(view.sort, created.sort)) {
      return
    }

    input.write.views(view.id).patch({
      sort: structuredClone(created.sort)
    })
    return {
      id: created.id
    }
  } catch (error) {
    reportSemanticError(input, error, 'input')
  }
}

const lowerViewSortPatch = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.patch' }>>
) => {
  const { intent } = input
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
    if (equal.sameJsonValue(view.sort, nextSort)) {
      return
    }

    input.write.views(view.id).patch({
      sort: structuredClone(nextSort)
    })
  } catch (error) {
    reportSemanticError(input, error, 'patch')
  }
}

const lowerViewSortMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.move' }>>
) => {
  const { intent } = input
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
    if (equal.sameJsonValue(view.sort, nextSort)) {
      return
    }

    input.write.views(view.id).patch({
      sort: structuredClone(nextSort)
    })
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewSortRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.sort.remove' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
  if (!view) {
    return
  }

  try {
    const nextSort = viewApi.sort.rules.write.remove(view.sort, intent.rule)
    if (equal.sameJsonValue(view.sort, nextSort)) {
      return
    }

    input.write.views(view.id).patch({
      sort: structuredClone(nextSort)
    })
  } catch (error) {
    reportSemanticError(input, error, 'rule')
  }
}

const lowerViewOpen = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.open' }>>
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  input.write.activeViewId.set(view.id)
}

const lowerViewOrderMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.order.move' }>>
) => {
  const { intent } = input
  const { query: reader } = input
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
    readViewOrderIds(view)
  )
  const nextOrder = replaceViewOrder(reorderRecordIds(currentOrder, recordId, {
    ...(beforeRecordId !== undefined && beforeRecordId !== recordId
      ? { beforeRecordId }
      : {})
  }))
  if (equal.sameOrder(readViewOrderIds(view), nextOrder)) {
    return
  }

  input.write.views(view.id).order.replace(nextOrder)
}

const lowerViewOrderSplice = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.order.splice' }>>
) => {
  const { intent } = input
  const { query: reader } = input
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
    readViewOrderIds(view)
  )
  const nextOrder = replaceViewOrder(spliceRecordIds(currentOrder, recordIds, {
    ...(beforeRecordId !== undefined ? { beforeRecordId } : {})
  }))
  if (equal.sameOrder(readViewOrderIds(view), nextOrder)) {
    return
  }

  input.write.views(view.id).order.replace(nextOrder)
}

const lowerViewFieldsMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.fields.move' }>>
) => {
  const { intent } = input
  if (!requireView(input, intent.id) || !requireField(input, intent.field, 'field')) {
    return
  }

  input.write.views(intent.id).fields.move(
    intent.field,
    toAnchor(intent.before !== undefined && intent.before !== intent.field
      ? intent.before
      : undefined)
  )
}

const lowerViewFieldsSplice = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.fields.splice' }>>
) => {
  const { intent } = input
  const { query: reader } = input
  if (!requireView(input, intent.id)) {
    return
  }

  const fieldIds = Array.from(new Set(intent.fields))
  if (!fieldIds.length) {
    emitProblem(input, 'view.invalidProjection', 'view.fields.splice requires at least one field id', 'fields')
    return
  }
  if (fieldIds.some((fieldId) => !reader.fields.has(fieldId))) {
    const missing = fieldIds.find((fieldId) => !reader.fields.has(fieldId))
    emitProblem(input, 'field.notFound', `Unknown field: ${missing}`, 'fields')
    return
  }

  const currentFieldIds = readViewFieldIds(reader.views.get(intent.id)!)
  const nextFieldIds = moveViewFields(
    currentFieldIds,
    fieldIds,
    intent.before
  )

  input.write.views(intent.id).fields.replace(nextFieldIds)
}

const lowerViewFieldsShow = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.fields.show' }>>
) => {
  const { intent } = input
  const view = requireView(input, intent.id)
  if (!view || !requireField(input, intent.field, 'field')) {
    return
  }

  const before = intent.before !== undefined && intent.before !== intent.field
    ? intent.before
    : undefined
  if (readViewFieldIds(view).includes(intent.field)) {
    input.write.views(intent.id).fields.move(intent.field, toAnchor(before))
    return
  }

  input.write.views(intent.id).fields.insert(intent.field, toAnchor(before))
}

const lowerViewFieldsHide = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.fields.hide' }>>
) => {
  const { intent } = input
  if (!requireView(input, intent.id) || !requireField(input, intent.field, 'field')) {
    return
  }

  input.write.views(intent.id).fields.remove(intent.field)
}

const lowerViewFieldsClear = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.fields.clear' }>>
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  input.write.views(view.id).fields.replace([])
}

const lowerViewRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'view.remove' }>>
) => {
  const view = requireView(input, input.intent.id)
  if (!view) {
    return
  }

  const nextDocument = documentViews.remove(input.document, view.id)
  input.write.views.remove(view.id)
  if (input.document.activeViewId !== nextDocument.activeViewId) {
    input.write.activeViewId.set(nextDocument.activeViewId)
  }
}

export const dataviewViewIntentHandlers = {
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
  'view.fields.move': lowerViewFieldsMove,
  'view.fields.splice': lowerViewFieldsSplice,
  'view.fields.show': lowerViewFieldsShow,
  'view.fields.hide': lowerViewFieldsHide,
  'view.fields.clear': lowerViewFieldsClear,
  'view.open': lowerViewOpen,
  'view.remove': lowerViewRemove
} satisfies DataviewViewIntentHandlers

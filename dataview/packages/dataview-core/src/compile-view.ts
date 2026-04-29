import type {
  FieldId,
  Filter,
  Intent,
  Search,
  Sort,
  SortRule,
  View,
  ViewCalc,
  ViewDisplay,
  ViewGroup
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/op'
import type { GalleryOptions } from '@dataview/core/types/state'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanOptions
} from '@dataview/core/types/state'
import type { TableOptions } from '@dataview/core/types/state'
import {
  calculation
} from '@dataview/core/view'
import { field as fieldApi } from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import {
  filter as filterApi
} from '@dataview/core/view'
import {
  group,
} from '@dataview/core/view'
import {
  search as searchApi
} from '@dataview/core/view'
import {
  sort as sortApi
} from '@dataview/core/view'
import { createId } from '@shared/core'
import {
  view as viewApi
} from '@dataview/core/view'
import { entityTable, equal, string } from '@shared/core'
import {
  type IssueSource,
  type ValidationIssue
} from '@dataview/core/operations/contracts'
import {
  createEntityPatch
} from './patch'
import {
  emitMany,
  issue as compileIssue,
  reportIssues,
  requireValue,
  type DataviewCompileInput
} from './base'
import type { DocumentReader } from '@dataview/core/operations/internal/read'

const sameRecordOrder = equal.sameOrder<string>

const emitOps = (
  input: DataviewCompileInput,
  ...operations: readonly DocumentOperation[]
) => {
  emitMany(input, ...operations)
}

const emitData = <T>(
  input: DataviewCompileInput,
  data: T,
  ...operations: readonly DocumentOperation[]
): T => {
  emitOps(input, ...operations)
  return data
}

const toViewPatch = (
  current: View,
  next: View
): DocumentOperation => {
  const patch = createEntityPatch(current, next)
  return {
    type: 'view.patch',
    id: current.id,
    patch
  }
}

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
  filterApi.rules.list(filter.rules).forEach((rule, index) => {
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
    if (!filterApi.rule.hasPreset(field, rule.presetId)) {
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
  sortApi.rules.list(sort.rules).forEach((rule, index) => {
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
    : [issue(source, 'view.invalidProjection', 'group field must be a non-empty string', `${path}.field`)]

  const field = string.isNonEmptyString(group.fieldId)
    ? reader.fields.get(group.fieldId)
    : undefined
  const fieldGroupMeta = field ? fieldApi.group.meta(field) : undefined
  const fieldGroupMetaForMode = field ? fieldApi.group.meta(field, { mode: group.mode }) : undefined

  if (!field) {
    issues.push(issue(source, 'field.notFound', `Unknown field: ${group.fieldId}`, `${path}.field`))
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

const applyViewPatch = (
  reader: DocumentReader,
  view: View,
  patch: Extract<Intent, { type: 'view.patch' }>['patch']
): View => {
  const nextType = patch.type ?? view.type
  const nextGroup = patch.group !== undefined
    ? (patch.group === null ? undefined : patch.group)
    : view.group
  const nextShared = {
    id: view.id,
    name: patch.name !== undefined ? patch.name : view.name,
    type: nextType,
    search: patch.search !== undefined
      ? searchApi.state.clone(patch.search)
      : searchApi.state.clone(view.search),
    filter: patch.filter !== undefined
      ? filterApi.state.clone(patch.filter)
      : filterApi.state.clone(view.filter),
    sort: patch.sort !== undefined
      ? {
          rules: sortApi.rules.clone(patch.sort.rules)
        }
      : {
          rules: sortApi.rules.clone(view.sort.rules)
        },
    calc: patch.calc !== undefined
      ? viewApi.calc.clone(patch.calc)
      : viewApi.calc.clone(view.calc),
    display: patch.display !== undefined
      ? viewApi.display.clone(patch.display)
      : viewApi.display.clone(view.display),
    orders: patch.orders !== undefined
      ? [...patch.orders]
      : [...view.orders]
  }

  switch (nextType) {
    case 'table':
      return {
        ...nextShared,
        type: 'table',
        ...(nextGroup
          ? {
              group: group.state.clone(nextGroup)
            }
          : {}),
        options: patch.options !== undefined
          ? viewApi.options.clone('table', patch.options as TableOptions)
          : view.type === 'table'
            ? viewApi.options.clone('table', view.options)
            : viewApi.options.defaults('table', [])
      }
    case 'gallery':
      return {
        ...nextShared,
        type: 'gallery',
        ...(nextGroup
          ? {
              group: group.state.clone(nextGroup)
            }
          : {}),
        options: patch.options !== undefined
          ? viewApi.options.clone('gallery', patch.options as GalleryOptions)
          : view.type === 'gallery'
            ? viewApi.options.clone('gallery', view.options)
            : viewApi.options.defaults('gallery', [])
      }
    case 'kanban': {
      const resolvedGroup = nextGroup
        ? group.state.clone(nextGroup)
        : (view.group
            ? group.state.clone(view.group)
            : resolveDefaultKanbanGroup(reader))
      if (!resolvedGroup) {
        return view
      }

      return {
        ...nextShared,
        type: 'kanban',
        group: resolvedGroup,
        options: patch.options !== undefined
          ? viewApi.options.clone('kanban', patch.options as KanbanOptions)
          : view.type === 'kanban'
            ? viewApi.options.clone('kanban', view.options)
            : viewApi.options.defaults('kanban', [])
      }
    }
  }
}

const normalizeView = (
  reader: DocumentReader,
  view: View
): View => {
  const fields = reader.fields.list()
  const nextGroup = group.state.normalize(view.group)
  const normalizedShared = {
    id: view.id,
    name: view.name,
    search: searchApi.state.normalize(view.search),
    filter: filterApi.state.normalize(view.filter),
    sort: {
      rules: sortApi.rules.normalize(view.sort.rules)
    },
    calc: calculation.view.normalize(view.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
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
        group: nextGroup ?? resolveDefaultKanbanGroup(reader) ?? view.group,
        options: viewApi.options.normalize(view.options, {
          type: 'kanban',
          fields
        })
      }
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

const requireView = (
  input: DataviewCompileInput,
  reader: DocumentReader,
  viewId: string
) => requireValue(
  input,
  reader.views.get(viewId),
  {
    code: 'view.notFound',
    message: `Unknown view: ${viewId}`,
    path: 'id'
  }
)

const lowerViewCreate = (
  intent: Extract<Intent, { type: 'view.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const explicitViewId = string.trimToUndefined(intent.input.id)
  const preferredName = string.trimToUndefined(intent.input.name) ?? ''

  if (intent.input.id !== undefined && !explicitViewId) {
    compileIssue(
      input,
      'view.invalid',
      'View id must be a non-empty string',
      'input.id'
    )
  }
  if (explicitViewId && reader.views.has(explicitViewId)) {
    compileIssue(
      input,
      'view.invalid',
      `View already exists: ${explicitViewId}`,
      'input.id'
    )
  }
  if (!preferredName) {
    compileIssue(
      input,
      'view.invalid',
      'View name must be a non-empty string',
      'input.name'
    )
  }
  if (!preferredName || (intent.input.id !== undefined && !explicitViewId) || (explicitViewId && reader.views.has(explicitViewId))) {
    return
  }

  const fields = reader.fields.list()
  const base = {
    id: explicitViewId || createId('view'),
    name: viewApi.name.unique({
      views: reader.views.list(),
      preferredName
    }),
    search: intent.input.search ?? { query: '' },
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
    orders: intent.input.orders ? [...intent.input.orders] : []
  }
  let created: View
  switch (intent.input.type) {
    case 'table':
      created = {
        ...base,
        type: 'table',
        ...(intent.input.group ? { group: intent.input.group } : {}),
        options: intent.input.options
          ? viewApi.options.clone('table', intent.input.options)
          : viewApi.options.defaults('table', fields)
      }
      break
    case 'gallery':
      created = {
        ...base,
        type: 'gallery',
        ...(intent.input.group ? { group: intent.input.group } : {}),
        options: intent.input.options
          ? viewApi.options.clone('gallery', intent.input.options)
          : viewApi.options.defaults('gallery', fields)
      }
      break
    case 'kanban': {
      const resolvedGroup = intent.input.group ?? resolveDefaultKanbanGroup(reader)
      if (!resolvedGroup) {
        compileIssue(
          input,
          'view.invalidProjection',
          'Kanban view requires a groupable field',
          'input.group'
        )
        return
      }

      created = {
        ...base,
        type: 'kanban',
        group: resolvedGroup,
        options: intent.input.options
          ? viewApi.options.clone('kanban', intent.input.options)
          : viewApi.options.defaults('kanban', fields)
      }
      break
    }
  }
  const view = ensureKanbanGroup(reader, normalizeView(reader, created))

  reportIssues(input, ...validateView(reader, input.source, view))
  return emitData(
    input,
    { id: view.id },
    {
      type: 'view.create',
      value: view
    },
    ...(reader.document().activeViewId === undefined
      ? [{
          type: 'document.patch',
          patch: {
            activeViewId: view.id
          }
        } satisfies DocumentOperation]
      : [])
  )
}

const lowerViewPatch = (
  intent: Extract<Intent, { type: 'view.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const view = requireView(input, reader, intent.id)
  if (!view) {
    return
  }

  const nextView = (
    intent.patch.type === 'kanban'
      ? ensureKanbanGroup(reader, normalizeView(reader, applyViewPatch(reader, view, intent.patch)))
      : normalizeView(reader, applyViewPatch(reader, view, intent.patch))
  )
  if (equal.sameJsonValue(nextView, view)) {
    return
  }

  reportIssues(input, ...validateView(reader, input.source, nextView))
  input.emit(toViewPatch(view, nextView))
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

  input.emit({
    type: 'view.open',
    id: view.id
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

  input.emit({
    type: 'view.remove',
    id: view.id
  })
}

export const compileViewIntent = (
  intent: Intent,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  switch (intent.type) {
    case 'view.create':
      return lowerViewCreate(intent, input, reader)
    case 'view.patch':
      return lowerViewPatch(intent, input, reader)
    case 'view.open':
      return lowerViewOpen(intent, input, reader)
    case 'view.remove':
      return lowerViewRemove(intent, input, reader)
    default:
      throw new Error(`Unsupported view intent: ${intent.type}`)
  }
}

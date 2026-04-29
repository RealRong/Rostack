import type {
  Field,
  FieldId,
  FilterRule,
  View,
  ViewGroup,
  ViewId
} from '@dataview/core/types'
import type {
  CalculationDemand
} from '@dataview/core/view'
import {
  calculation
} from '@dataview/core/view'
import {
  filter as filterApi
} from '@dataview/core/view'
import {
  view as viewApi
} from '@dataview/core/view'
import type {
  DataviewActiveSpec,
  DataviewFrame
} from '@dataview/engine/active/frame'
import type {
  DataviewIndexResult
} from '@dataview/engine/active/index/runtime'
import {
  normalizeIndexDemand,
  resolveDefaultSearchFieldIds
} from '@dataview/engine/active/index/demand'
import {
  bucket
} from '@dataview/engine/active/index/bucket'
import type {
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  writeQueryExecutionKey
} from '@dataview/engine/active/query/key'
import type {
  DataviewActiveState,
  PhaseAction
} from '@dataview/engine/active/state'
import type {
  DocumentReadContext,
  DocumentReader
} from '@dataview/core/document/reader'
import type {
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import { collection, set as setCore, string } from '@shared/core'

export interface EffectiveFilterRule {
  fieldId: FieldId
  field: Field | undefined
  rule: FilterRule
}

export interface QueryPlan {
  search?: {
    query: string
    fieldIds: readonly FieldId[]
  }
  filters: readonly EffectiveFilterRule[]
  watch: {
    search: readonly FieldId[] | 'all'
    filter: readonly FieldId[]
    sort: readonly FieldId[]
  }
  executionKey: string
}

export interface DataviewActivePlan {
  reset: boolean
  query: {
    action: PhaseAction
    reuse?: {
      matched: boolean
      ordered: boolean
    }
  }
  membership: {
    action: PhaseAction
  }
  summary: {
    action: PhaseAction
  }
  publish: {
    action: PhaseAction
  }
}

const EMPTY_FIELDS = [] as const

const isKnownFieldId = (
  reader: DocumentReader,
  fieldId: FieldId
): boolean => fieldId === 'title' || reader.fields.has(fieldId)

const resolveSearchFieldIds = (
  reader: DocumentReader,
  view: View
): readonly FieldId[] => (
  view.search.fields?.length
    ? collection.uniqueSorted(view.search.fields.filter(fieldId => isKnownFieldId(reader, fieldId)))
    : resolveDefaultSearchFieldIds({
      document: reader.document(),
      reader
    })
)

const resolveEffectiveFilterRules = (
  reader: DocumentReader,
  view: View
): readonly EffectiveFilterRule[] => {
  const rules: EffectiveFilterRule[] = []
  const filterRules = filterApi.rules.list(view.filter.rules)

  for (let index = 0; index < filterRules.length; index += 1) {
    const rule = filterRules[index]!
    const field = reader.fields.get(rule.fieldId)
    if (!filterApi.rule.effective(field, rule)) {
      continue
    }

    rules.push({
      fieldId: rule.fieldId,
      field,
      rule
    })
  }

  return rules
}

const resolveIndexedFilterRules = (
  reader: DocumentReader,
  view: View
): readonly EffectiveFilterRule[] => {
  const rules: EffectiveFilterRule[] = []
  const filterRules = filterApi.rules.list(view.filter.rules)

  for (let index = 0; index < filterRules.length; index += 1) {
    const rule = filterRules[index]!
    if (!isKnownFieldId(reader, rule.fieldId)) {
      continue
    }

    const field = reader.fields.get(rule.fieldId)
    if (!filterApi.rule.effective(field, rule)) {
      continue
    }

    rules.push({
      fieldId: rule.fieldId,
      field,
      rule
    })
  }

  return rules
}

const createQueryPlan = (
  reader: DocumentReader,
  view: View
): QueryPlan => {
  const searchFieldIds = resolveSearchFieldIds(reader, view)
  const searchQuery = string.trimLowercase(view.search.query)
  const filters = resolveEffectiveFilterRules(reader, view)
  const search = searchQuery
    ? {
        query: searchQuery,
        fieldIds: searchFieldIds
      }
    : undefined

  return {
    ...(search
      ? { search }
      : {}),
    filters,
    watch: {
      search: search
        ? (view.search.fields?.length ? search.fieldIds : 'all')
        : [],
      filter: collection.uniqueSorted(filters.map(entry => entry.fieldId)),
      sort: collection.uniqueSorted(
        view.sort.rules.ids.flatMap(ruleId => {
          const rule = view.sort.rules.byId[ruleId]
          return rule
            ? [rule.fieldId]
            : []
        })
      )
    },
    executionKey: writeQueryExecutionKey({
      search,
      filters: filters.map(({ fieldId, field, rule }) => ({
        fieldId,
        fieldKind: field?.kind,
        rule
      })),
      filterMode: view.filter.mode,
      sort: view.sort,
      orders: view.orders
    })
  }
}

const readCalculationDemands = (
  view: View
): {
  calcFields: readonly FieldId[]
  calculations: readonly CalculationDemand[]
} => {
  const calculations = Object.entries(view.calc)
    .flatMap(([fieldId, metric]) => metric
      ? [calculation.demand.create(fieldId as FieldId, metric)]
      : [])

  return {
    calcFields: calculations.map(entry => entry.fieldId),
    calculations
  }
}

export const compileDataviewResolvedActive = (
  reader: DocumentReader,
  view: View
): DataviewActiveSpec => {
  const query = createQueryPlan(reader, view)
  const indexedFilters = resolveIndexedFilterRules(reader, view)
  const displayFields = view.display.fields?.length
    ? [...viewApi.demand.display(view)]
    : []
  const filterBucketSpecs = collection.uniqueSorted(
    indexedFilters.flatMap(entry => (
      filterApi.rule.planDemand(entry.field, entry.rule).bucket
        ? [entry.fieldId]
        : []
    ))
  ).map(fieldId => bucket.normalize({
    fieldId
  }))
  const section = view.group
    ? {
        fieldId: view.group.fieldId,
        ...(view.group.mode === undefined ? {} : { mode: view.group.mode }),
        ...(view.group.bucketSort === undefined ? {} : { sort: view.group.bucketSort }),
        ...(view.group.bucketInterval === undefined ? {} : { interval: view.group.bucketInterval }),
        showEmpty: view.group.showEmpty !== false
      }
    : undefined
  const buckets = section
    ? [
        bucket.normalize({
          fieldId: section.fieldId,
          mode: section.mode,
          bucketInterval: section.interval
        }),
        ...filterBucketSpecs
      ]
    : filterBucketSpecs
  const sortFields = collection.unique([
    ...viewApi.demand.sort(view),
    ...indexedFilters.flatMap(entry => (
      filterApi.rule.planDemand(entry.field, entry.rule).sorted
        ? [entry.fieldId]
        : []
    ))
  ])
  const { calcFields, calculations } = readCalculationDemands(view)
  const demand = normalizeIndexDemand({
    document: reader.document(),
    reader
  }, {
    search: {
      fieldIds: query.search?.fieldIds ?? resolveSearchFieldIds(reader, view)
    },
    ...(buckets.length ? { buckets } : {}),
    ...(displayFields.length ? { displayFields } : {}),
    ...(sortFields.length ? { sortFields } : {}),
    ...(calculations.length ? { calculations } : {})
  })

  return {
    id: view.id,
    view,
    demand,
    query,
    ...(section ? { section } : {}),
    calcFields
  }
}

export const resolveDataviewActive = (
  context: DocumentReadContext,
  activeViewId?: ViewId
): DataviewActiveSpec | undefined => {
  const view = activeViewId === context.activeViewId
    ? context.activeView
    : activeViewId
      ? context.reader.views.get(activeViewId)
      : undefined

  return view
    ? compileDataviewResolvedActive(context.reader, view)
    : undefined
}

const sameSection = (
  previous?: DataviewActiveSpec['section'],
  next?: DataviewActiveSpec['section']
): boolean => {
  if (!previous || !next) {
    return previous === next
  }

  return previous.fieldId === next.fieldId
    && previous.mode === next.mode
    && previous.sort === next.sort
    && previous.interval === next.interval
    && previous.showEmpty === next.showEmpty
}

const sameCalcFields = (
  previous: readonly FieldId[] = EMPTY_FIELDS,
  next: readonly FieldId[] = EMPTY_FIELDS
): boolean => previous.length === next.length
  && previous.every((fieldId, index) => fieldId === next[index])

const hasAnyTouchedField = (
  fields: ReadonlySet<FieldId> | 'all',
  candidates: readonly FieldId[]
): boolean => fields === 'all'
  ? candidates.length > 0
  : setCore.intersectsValues(candidates, fields)

const hasQuerySchemaChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => {
  const schemaFields = input.delta.field.schema.touchedIds()
  if (schemaFields === 'all') {
    return true
  }
  if (schemaFields.size === 0) {
    return false
  }

  if (
    hasAnyTouchedField(schemaFields, input.plan.watch.filter)
    || hasAnyTouchedField(schemaFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return true
  }

  return hasAnyTouchedField(schemaFields, input.plan.watch.search)
}

const hasQueryFieldChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => {
  const touchedFields = input.delta.field.touchedIds()
  const schemaFields = input.delta.field.schema.touchedIds()

  if (touchedFields === 'all') {
    return true
  }

  if (
    hasAnyTouchedField(touchedFields, input.plan.watch.filter)
    || hasAnyTouchedField(touchedFields, input.plan.watch.sort)
  ) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    return touchedFields.size > 0
      || schemaFields === 'all'
      || schemaFields.size > 0
  }

  return hasAnyTouchedField(touchedFields, input.plan.watch.search)
}

const hasQueryInputChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => input.delta.recordSetChanged()
  || hasQuerySchemaChanges(input)
  || hasQueryFieldChanges(input)

const hasVisibleInputChanges = (input: {
  delta: DataviewMutationDelta
  plan: QueryPlan
}): boolean => {
  const touchedFields = input.delta.field.touchedIds()
  const schemaFields = input.delta.field.schema.touchedIds()

  if (input.delta.recordSetChanged()) {
    return true
  }

  if (schemaFields === 'all') {
    return true
  }

  if (hasAnyTouchedField(schemaFields, input.plan.watch.filter)) {
    return true
  }

  if (input.plan.watch.search === 'all') {
    if (touchedFields === 'all') {
      return true
    }

    return touchedFields.size > 0 || schemaFields.size > 0
  }

  if (
    hasAnyTouchedField(schemaFields, input.plan.watch.search)
    || (touchedFields !== 'all' && hasAnyTouchedField(touchedFields, input.plan.watch.search))
  ) {
    return true
  }

  if (touchedFields === 'all') {
    return input.plan.watch.filter.length > 0
  }

  return hasAnyTouchedField(touchedFields, input.plan.watch.filter)
}

const hasSortInputChanges = (input: {
  active: DataviewActiveSpec
  delta: DataviewMutationDelta
}): boolean => {
  if (
    input.delta.recordSetChanged()
    || input.delta.view.query(input.active.id).changed('sort')
  ) {
    return true
  }

  for (const fieldId of input.active.query.watch.sort) {
    if (input.delta.field.schema.changed(fieldId)) {
      return true
    }
  }

  return hasAnyTouchedField(
    input.delta.field.touchedIds(),
    input.active.query.watch.sort
  )
}

const resolveQueryAction = (input: {
  phaseRebuild: boolean
  querySync: boolean
  reuseMatched: boolean
  reuseOrdered: boolean
}): DataviewActivePlan['query'] => {
  if (input.phaseRebuild) {
    return {
      action: 'rebuild'
    }
  }

  if (input.querySync) {
    return {
      action: 'sync',
      ...((input.reuseMatched || input.reuseOrdered)
        ? {
            reuse: {
              matched: input.reuseMatched,
              ordered: input.reuseOrdered
            }
          }
        : {})
    }
  }

  return {
    action: 'reuse'
  }
}

const resolveMembershipAction = (input: {
  phaseRebuild: boolean
  grouped: boolean
  rebuild: boolean
  sync: boolean
  bucketRebuild: boolean
  bucketChanged: boolean
  queryAction: PhaseAction
}): PhaseAction => {
  if (input.phaseRebuild) {
    return 'rebuild'
  }

  if (input.queryAction === 'rebuild' || input.bucketRebuild) {
    return 'rebuild'
  }

  if (!input.grouped) {
    return input.queryAction === 'reuse'
      ? 'reuse'
      : 'sync'
  }

  if (input.rebuild) {
    return 'rebuild'
  }

  if (input.sync) {
    return 'sync'
  }

  return input.queryAction !== 'reuse' || input.bucketChanged
    ? 'sync'
    : 'reuse'
}

const resolveSummaryAction = (input: {
  phaseRebuild: boolean
  enabled: boolean
  rebuild: boolean
  sync: boolean
  sectionChanged: boolean
}): PhaseAction => {
  if (input.phaseRebuild) {
    return 'rebuild'
  }

  if (!input.enabled) {
    return input.sectionChanged
      ? 'sync'
      : 'reuse'
  }

  if (input.rebuild) {
    return 'rebuild'
  }

  return input.sync || input.sectionChanged
    ? 'sync'
    : 'reuse'
}

const resolvePublishAction = (input: {
  snapshotRebuild: boolean
  layoutChanged: boolean
  queryAction: PhaseAction
  membershipAction: PhaseAction
  summaryAction: PhaseAction
}): PhaseAction => {
  if (input.snapshotRebuild) {
    return 'rebuild'
  }

  if (
    input.queryAction !== 'reuse'
    || input.membershipAction !== 'reuse'
    || input.summaryAction !== 'reuse'
    || input.layoutChanged
  ) {
    return 'sync'
  }

  return 'reuse'
}

export const createDataviewActivePlan = (input: {
  frame: DataviewFrame
  previous: DataviewActiveState
  index?: DataviewIndexResult
}): DataviewActivePlan => {
  const active = input.frame.active
  if (!active) {
    return {
      reset: Boolean(input.previous.snapshot),
      query: {
        action: 'reuse'
      },
      membership: {
        action: 'reuse'
      },
      summary: {
        action: 'reuse'
      },
      publish: {
        action: input.previous.snapshot
          ? 'sync'
          : 'reuse'
      }
    }
  }

  const previousSpec = input.previous.spec
  const previousSnapshot = input.previous.snapshot
  const activeViewChanged = input.frame.delta.document.activeViewChanged()
  const sectionChanged = !sameSection(previousSpec?.section, active.section)
  const calcFieldsChanged = !sameCalcFields(previousSpec?.calcFields, active.calcFields)
  const phaseRebuild = (
    !previousSnapshot
    || !previousSpec
    || previousSpec.id !== active.id
    || activeViewChanged
  )
  const queryDefinitionChanged = previousSpec?.query.executionKey !== active.query.executionKey
  const queryInputChanged = hasQueryInputChanges({
    delta: input.frame.delta,
    plan: active.query
  })
  const visibleInputChanged = hasVisibleInputChanges({
    delta: input.frame.delta,
    plan: active.query
  })
  const sortInputChanged = hasSortInputChanges({
    active,
    delta: input.frame.delta
  })
  const groupField = active.view.group?.fieldId
  const touchedFields = input.frame.delta.field.touchedIds()
  const indexDelta = input.index?.index.delta
  const groupSchemaChanged = groupField
    ? input.frame.delta.field.schema.changed(groupField)
    : false
  const groupValueChanged = groupField
    ? touchedFields === 'all' || touchedFields.has(groupField)
    : false

  let calcSchemaChanged = false
  for (const fieldId of active.calcFields) {
    if (input.frame.delta.field.schema.changed(fieldId)) {
      calcSchemaChanged = true
      break
    }
  }

  const query = resolveQueryAction({
    phaseRebuild,
    querySync: input.frame.delta.view.query(active.id).changed()
      || queryDefinitionChanged
      || queryInputChanged,
    reuseMatched: !sortInputChanged,
    reuseOrdered: !sortInputChanged
      && (
        active.view.sort.rules.ids.length > 0
        || !input.frame.delta.view.query(active.id).changed('order')
      )
  })
  const membershipAction = resolveMembershipAction({
    phaseRebuild,
    grouped: Boolean(groupField),
    rebuild: input.frame.delta.view.query(active.id).changed('group')
      || groupSchemaChanged
      || input.frame.delta.recordSetChanged(),
    sync: groupValueChanged,
    bucketRebuild: Boolean(indexDelta?.bucket?.rebuild),
    bucketChanged: Boolean(indexDelta?.bucket),
    queryAction: query.action
  })
  const summaryAction = resolveSummaryAction({
    phaseRebuild,
    enabled: active.calcFields.length > 0,
    rebuild: input.frame.delta.view.calc(active.id).changed()
      || calcSchemaChanged
      || groupSchemaChanged,
    sync: input.frame.delta.view.query(active.id).changed('search')
      || input.frame.delta.view.query(active.id).changed('filter')
      || visibleInputChanged
      || Boolean(indexDelta?.calculation)
      || (groupField !== undefined && (
        input.frame.delta.view.query(active.id).changed('group')
        || groupValueChanged
        || Boolean(indexDelta?.bucket)
      )),
    sectionChanged
  })

  return {
    reset: input.frame.delta.reset === true
      || phaseRebuild
      || sectionChanged
      || calcFieldsChanged,
    query,
    membership: {
      action: membershipAction
    },
    summary: {
      action: summaryAction
    },
    publish: {
      action: resolvePublishAction({
        snapshotRebuild: (
          !previousSnapshot
          || previousSnapshot.view.id !== active.id
          || previousSnapshot.view.type !== active.view.type
        ),
        layoutChanged: input.frame.delta.view.layout(active.id).changed(),
        queryAction: query.action,
        membershipAction,
        summaryAction
      })
    }
  }
}

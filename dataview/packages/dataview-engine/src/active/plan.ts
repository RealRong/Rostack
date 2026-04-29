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
  DataviewActiveFrame,
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
  DataviewLastActive,
  DataviewState,
  PhaseAction
} from '@dataview/engine/active/state'
import type {
  DocumentReadContext,
  DocumentReader
} from '@dataview/engine/document/reader'
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

export interface DataviewResolvedActive {
  id: ViewId
  view: View
  demand: NormalizedIndexDemand
  query: QueryPlan
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
}

export interface DataviewActivePlan {
  reset: boolean
  reasons: DataviewActivePlanReasons
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
): DataviewResolvedActive => {
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
): DataviewResolvedActive | undefined => {
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
  previous?: DataviewLastActive['section'],
  next?: DataviewActiveFrame['section']
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
  active: DataviewActiveFrame
  delta: DataviewMutationDelta
}): boolean => {
  if (
    input.delta.recordSetChanged()
    || input.delta.view.query(input.active.id).changed('sort')
  ) {
    return true
  }

  for (const fieldId of input.active.query.plan.watch.sort) {
    if (input.delta.field.schema.changed(fieldId)) {
      return true
    }
  }

  return hasAnyTouchedField(
    input.delta.field.touchedIds(),
    input.active.query.plan.watch.sort
  )
}

export interface DataviewActivePlanReasons {
  lifecycle: {
    phaseRebuild: boolean
    reset: boolean
  }
  query: {
    sync: boolean
    reuse: {
      matched: boolean
      ordered: boolean
    }
  }
  membership: {
    grouped: boolean
    rebuild: boolean
    sync: boolean
  }
  summary: {
    enabled: boolean
    rebuild: boolean
    sync: boolean
    sectionChanged: boolean
  }
  index: {
    rebuilt: boolean
    switched: boolean
    bucketRebuild: boolean
    bucketChanged: boolean
  }
  publish: {
    snapshotRebuild: boolean
    layoutChanged: boolean
  }
}

const createDataviewActivePlanReasons = (input: {
  frame: DataviewFrame
  active: DataviewActiveFrame
  state: DataviewState
  index?: DataviewIndexResult
}): DataviewActivePlanReasons => {
  const { frame, active, state, index } = input
  const previous = state.lastActive
  const previousSnapshot = state.active.snapshot
  const activeViewChanged = frame.delta.document.activeViewChanged()
  const sectionChanged = !sameSection(previous?.section, active.section)
  const calcFieldsChanged = !sameCalcFields(previous?.calcFields, active.calc.fields)
  const phaseRebuild = (
    !previousSnapshot
    || !previous
    || previous.id !== active.id
    || activeViewChanged
  )
  const queryDefinitionChanged = previous?.queryKey !== active.query.plan.executionKey
  const queryInputChanged = hasQueryInputChanges({
    delta: frame.delta,
    plan: active.query.plan
  })
  const visibleInputChanged = hasVisibleInputChanges({
    delta: frame.delta,
    plan: active.query.plan
  })
  const sortInputChanged = hasSortInputChanges({
    active,
    delta: frame.delta
  })
  const groupField = active.view.group?.fieldId
  const touchedFields = frame.delta.field.touchedIds()
  const indexDelta = index?.entry.delta
  const groupSchemaChanged = groupField
    ? frame.delta.field.schema.changed(groupField)
    : false
  const groupValueChanged = groupField
    ? touchedFields === 'all' || touchedFields.has(groupField)
    : false

  let calcSchemaChanged = false
  for (const fieldId of active.calc.fields) {
    if (frame.delta.field.schema.changed(fieldId)) {
      calcSchemaChanged = true
    }
  }

  return {
    lifecycle: {
      phaseRebuild,
      reset: frame.delta.reset === true
        || phaseRebuild
        || sectionChanged
        || calcFieldsChanged
    },
    query: {
      sync: active.query.changed()
        || queryDefinitionChanged
        || queryInputChanged,
      reuse: {
        matched: !sortInputChanged,
        ordered: !sortInputChanged
          && (
            active.view.sort.rules.ids.length > 0
            || !active.query.changed('order')
          )
      }
    },
    membership: {
      grouped: Boolean(groupField),
      rebuild: active.query.changed('group')
        || groupSchemaChanged
        || frame.delta.recordSetChanged(),
      sync: groupValueChanged
    },
    summary: {
      enabled: active.calc.fields.length > 0,
      rebuild: active.calc.changed()
        || calcSchemaChanged
        || groupSchemaChanged,
      sync: active.query.changed('search')
        || active.query.changed('filter')
        || visibleInputChanged
        || Boolean(indexDelta?.calculation)
        || (groupField !== undefined && (
          frame.delta.view.query(active.id).changed('group')
          || groupValueChanged
          || Boolean(indexDelta?.bucket)
        )),
      sectionChanged
    },
    index: {
      rebuilt: index?.action === 'rebuild',
      switched: index?.action === 'switch',
      bucketRebuild: Boolean(indexDelta?.bucket?.rebuild),
      bucketChanged: Boolean(indexDelta?.bucket),
    },
    publish: {
      snapshotRebuild: (
        !previousSnapshot
        || previousSnapshot.view.id !== active.id
        || previousSnapshot.view.type !== active.view.type
      ),
      layoutChanged: frame.delta.view.layout(active.id).changed()
    }
  }
}

const resolveQueryAction = (
  reasons: DataviewActivePlanReasons
): DataviewActivePlan['query'] => {
  if (reasons.lifecycle.phaseRebuild) {
    return {
      action: 'rebuild'
    }
  }

  if (reasons.query.sync) {
    return {
      action: 'sync',
      ...(reasons.query.reuse.matched || reasons.query.reuse.ordered
        ? {
            reuse: reasons.query.reuse
          }
        : {})
    }
  }

  return {
    action: 'reuse'
  }
}

const resolveMembershipAction = (input: {
  reasons: DataviewActivePlanReasons
  queryAction: PhaseAction
}): PhaseAction => {
  if (input.reasons.lifecycle.phaseRebuild) {
    return 'rebuild'
  }

  if (
    input.queryAction === 'rebuild'
    || input.reasons.index.bucketRebuild
  ) {
    return 'rebuild'
  }

  if (!input.reasons.membership.grouped) {
    return input.queryAction === 'reuse'
      ? 'reuse'
      : 'sync'
  }

  if (input.reasons.membership.rebuild) {
    return 'rebuild'
  }

  if (input.reasons.membership.sync) {
    return 'sync'
  }

  return input.queryAction !== 'reuse'
    || input.reasons.index.bucketChanged
    ? 'sync'
    : 'reuse'
}

const resolveSummaryAction = (input: {
  reasons: DataviewActivePlanReasons
}): PhaseAction => {
  if (input.reasons.lifecycle.phaseRebuild) {
    return 'rebuild'
  }

  if (!input.reasons.summary.enabled) {
    return input.reasons.summary.sectionChanged
      ? 'sync'
      : 'reuse'
  }

  if (
    input.reasons.summary.rebuild
  ) {
    return 'rebuild'
  }

  return input.reasons.summary.sync
    || input.reasons.summary.sectionChanged
    ? 'sync'
    : 'reuse'
}

const resolvePublishAction = (input: {
  reasons: DataviewActivePlanReasons
  queryAction: PhaseAction
  membershipAction: PhaseAction
  summaryAction: PhaseAction
}): PhaseAction => {
  if (input.reasons.publish.snapshotRebuild) {
    return 'rebuild'
  }

  if (
    input.queryAction !== 'reuse'
    || input.membershipAction !== 'reuse'
    || input.summaryAction !== 'reuse'
    || input.reasons.publish.layoutChanged
  ) {
    return 'sync'
  }

  return 'reuse'
}

export const createDataviewLastActive = (
  active?: DataviewActiveFrame
): DataviewLastActive | undefined => active
  ? {
      id: active.id,
      queryKey: active.query.plan.executionKey,
      ...(active.section
        ? {
            section: active.section
          }
        : {}),
      calcFields: active.calc.fields
    }
  : undefined

export const createDataviewActivePlan = (input: {
  frame: DataviewFrame
  state: DataviewState
  index?: DataviewIndexResult
}): DataviewActivePlan => {
  const active = input.frame.active
  if (!active) {
    const reasons: DataviewActivePlanReasons = {
      lifecycle: {
        phaseRebuild: false,
        reset: Boolean(input.state.active.snapshot)
      },
      query: {
        sync: false,
        reuse: {
          matched: false,
          ordered: false
        }
      },
      membership: {
        grouped: false,
        rebuild: false,
        sync: false
      },
      summary: {
        enabled: false,
        rebuild: false,
        sync: false,
        sectionChanged: false
      },
      index: {
        rebuilt: false,
        switched: false,
        bucketRebuild: false,
        bucketChanged: false
      },
      publish: {
        snapshotRebuild: false,
        layoutChanged: false
      }
    }

    return {
      reset: Boolean(input.state.active.snapshot),
      reasons,
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
        action: input.state.active.snapshot
          ? 'sync'
          : 'reuse'
      }
    }
  }

  const reasons = createDataviewActivePlanReasons({
    frame: input.frame,
    active,
    state: input.state,
    index: input.index
  })
  const query = resolveQueryAction(reasons)
  const membershipAction = resolveMembershipAction({
    reasons,
    queryAction: query.action,
  })
  const summaryAction = resolveSummaryAction({
    reasons
  })

  return {
    reset: reasons.lifecycle.reset,
    reasons,
    query,
    membership: {
      action: membershipAction
    },
    summary: {
      action: summaryAction
    },
    publish: {
      action: resolvePublishAction({
        reasons,
        queryAction: query.action,
        membershipAction,
        summaryAction
      })
    }
  }
}

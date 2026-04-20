import type {
  Field,
  FieldId,
  View,
  ViewGroup,
  ViewId
} from '@dataview/core/contracts'
import type {
  CalculationDemand
} from '@dataview/core/calculation'
import {
  calculation
} from '@dataview/core/calculation'
import {
  filter as filterApi
} from '@dataview/core/filter'
import {
  viewDisplayFields,
  viewSortFields
} from '@dataview/core/view'
import {
  resolveDefaultSearchFieldIds
} from '@dataview/engine/active/index/demand'
import type {
  BucketSpec,
  IndexDemand
} from '@dataview/engine/active/index/contracts'
import type {
  DocumentReadContext,
  DocumentReader
} from '@dataview/engine/document/reader'
import {
  trimLowercase,
  uniqueSorted
} from '@shared/core'

export interface EffectiveFilterRule {
  fieldId: FieldId
  field: Field | undefined
  rule: View['filter']['rules'][number]
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

export interface ViewPlan {
  query: QueryPlan
  demand: IndexDemand
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
}

export type ViewPlanQueryChange =
  | 'none'
  | 'execution'
  | 'definition'

export interface ViewPlanChange {
  query: ViewPlanQueryChange
  index: {
    all: boolean
    search: boolean
    bucket: readonly FieldId[]
    sort: readonly FieldId[]
    calc: readonly FieldId[]
  }
  view: {
    query: boolean
    section: boolean
    summary: boolean
  }
  output: {
    publish: boolean
    source: boolean
    table: boolean
  }
}

const isKnownFieldId = (
  reader: DocumentReader,
  fieldId: FieldId
): boolean => fieldId === 'title' || reader.fields.has(fieldId)

const resolveSearchFieldIds = (
  reader: DocumentReader,
  view: View
): readonly FieldId[] => (
  view.search.fields?.length
    ? uniqueSorted(view.search.fields.filter(fieldId => isKnownFieldId(reader, fieldId)))
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

  for (let index = 0; index < view.filter.rules.length; index += 1) {
    const rule = view.filter.rules[index]!
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

  for (let index = 0; index < view.filter.rules.length; index += 1) {
    const rule = view.filter.rules[index]!
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

const createExecutionKey = (input: {
  search?: QueryPlan['search']
  filters: readonly EffectiveFilterRule[]
  filterMode: View['filter']['mode']
  sort: View['sort']
  orders: View['orders']
}): string => JSON.stringify({
  search: input.search
    ? {
        query: input.search.query,
        fieldIds: input.search.fieldIds
      }
    : undefined,
  filters: input.filters.map(({ fieldId, field, rule }) => ({
    fieldId,
    fieldKind: field?.kind,
    rule
  })),
  filterMode: input.filters.length
    ? input.filterMode
    : undefined,
  sort: input.sort,
  orders: input.orders
})

const createBucketSpec = (
  fieldId: FieldId,
  mode?: ViewGroup['mode'],
  interval?: ViewGroup['bucketInterval']
): BucketSpec => ({
  fieldId,
  ...(mode === undefined ? {} : { mode }),
  ...(interval === undefined ? {} : { interval })
})

const createQueryPlan = (
  reader: DocumentReader,
  view: View
): QueryPlan => {
  const searchFieldIds = resolveSearchFieldIds(reader, view)
  const searchQuery = trimLowercase(view.search.query)
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
      filter: uniqueSorted(filters.map(entry => entry.fieldId)),
      sort: uniqueSorted(view.sort.map(sorter => sorter.field))
    },
    executionKey: createExecutionKey({
      search,
      filters,
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
      ? [calculation.reducer.demand.create(fieldId as FieldId, metric)]
      : [])

  return {
    calcFields: calculations.map(entry => entry.fieldId),
    calculations
  }
}

export const compileViewPlan = (
  reader: DocumentReader,
  view: View
): ViewPlan => {
  const query = createQueryPlan(reader, view)
  const indexedFilters = resolveIndexedFilterRules(reader, view)
  const displayFields = view.display.fields?.length
    ? [...viewDisplayFields(view)]
    : []
  const filterBucketSpecs = uniqueSorted(
    indexedFilters.flatMap(entry => (
      filterApi.rule.planDemand(entry.field, entry.rule).bucket
        ? [entry.fieldId]
        : []
    ))
  ).map(fieldId => createBucketSpec(fieldId))
  const section = view.group
    ? {
        fieldId: view.group.field,
        ...(view.group.mode === undefined ? {} : { mode: view.group.mode }),
        ...(view.group.bucketSort === undefined ? {} : { sort: view.group.bucketSort }),
        ...(view.group.bucketInterval === undefined ? {} : { interval: view.group.bucketInterval }),
        showEmpty: view.group.showEmpty !== false
      }
    : undefined
  const buckets = section
    ? [
        createBucketSpec(section.fieldId, section.mode, section.interval),
        ...filterBucketSpecs
      ]
    : filterBucketSpecs
  const sortFields = Array.from(new Set([
    ...viewSortFields(view),
    ...indexedFilters.flatMap(entry => (
      filterApi.rule.planDemand(entry.field, entry.rule).sorted
        ? [entry.fieldId]
        : []
    ))
  ]))
  const { calcFields, calculations } = readCalculationDemands(view)

  return {
    query,
    demand: {
      search: {
        fieldIds: query.search?.fieldIds ?? resolveSearchFieldIds(reader, view)
      },
      ...(buckets.length ? { buckets } : {}),
      ...(displayFields.length
        ? {
            displayFields
          }
        : {}),
      ...(sortFields.length
        ? { sortFields }
        : {}),
      ...(calculations.length
        ? { calculations }
        : {})
    },
    ...(section ? { section } : {}),
    calcFields
  }
}

const sameFieldIds = (
  left: readonly FieldId[] = [],
  right: readonly FieldId[] = []
) => left.length === right.length
  && left.every((fieldId, index) => fieldId === right[index])

const sameBucketSpecs = (
  left: readonly BucketSpec[] = [],
  right: readonly BucketSpec[] = []
) => left.length === right.length
  && left.every((spec, index) => {
    const next = right[index]
    return next !== undefined
      && spec.fieldId === next.fieldId
      && spec.mode === next.mode
      && spec.interval === next.interval
  })

const sameSectionPlan = (
  left: ViewPlan['section'],
  right: ViewPlan['section']
) => (
  left?.fieldId === right?.fieldId
  && left?.mode === right?.mode
  && left?.sort === right?.sort
  && left?.interval === right?.interval
  && left?.showEmpty === right?.showEmpty
)

const EMPTY_PLAN_CHANGE: ViewPlanChange = {
  query: 'none',
  index: {
    all: false,
    search: false,
    bucket: [],
    sort: [],
    calc: []
  },
  view: {
    query: false,
    section: false,
    summary: false
  },
  output: {
    publish: false,
    source: false,
    table: false
  }
}

export const diffViewPlan = (
  previous: ViewPlan | undefined,
  next: ViewPlan | undefined
): ViewPlanChange => {
  if (!previous && !next) {
    return EMPTY_PLAN_CHANGE
  }

  if (!previous || !next) {
    return {
      query: 'definition',
      index: {
        all: true,
        search: true,
        bucket: next?.demand.buckets?.map(spec => spec.fieldId) ?? [],
        sort: next?.demand.sortFields ?? [],
        calc: next?.calcFields ?? []
      },
      view: {
        query: true,
        section: true,
        summary: true
      },
      output: {
        publish: true,
        source: true,
        table: true
      }
    }
  }

  const searchChanged = !sameFieldIds(
    previous.demand.search?.fieldIds,
    next.demand.search?.fieldIds
  )
  const bucketChanged = !sameBucketSpecs(
    previous.demand.buckets,
    next.demand.buckets
  )
  const sortChanged = !sameFieldIds(
    previous.demand.sortFields,
    next.demand.sortFields
  )
  const calcChanged = !sameFieldIds(
    previous.calcFields,
    next.calcFields
  )
  const sectionChanged = !sameSectionPlan(previous.section, next.section)
  const queryDefinitionChanged = (
    searchChanged
    || bucketChanged
    || sortChanged
    || calcChanged
    || sectionChanged
  )
  const queryChanged = previous.query.executionKey !== next.query.executionKey
  const bucketFieldIds = Array.from(new Set([
    ...(previous.demand.buckets?.map(spec => spec.fieldId) ?? []),
    ...(next.demand.buckets?.map(spec => spec.fieldId) ?? [])
  ]))
  const sortFieldIds = Array.from(new Set([
    ...(previous.demand.sortFields ?? []),
    ...(next.demand.sortFields ?? [])
  ]))
  const calcFieldIds = Array.from(new Set([
    ...previous.calcFields,
    ...next.calcFields
  ]))

  return {
    query: queryDefinitionChanged
      ? 'definition'
      : queryChanged
        ? 'execution'
        : 'none',
    index: {
      all: false,
      search: searchChanged,
      bucket: bucketChanged ? bucketFieldIds : [],
      sort: sortChanged ? sortFieldIds : [],
      calc: calcChanged ? calcFieldIds : []
    },
    view: {
      query: queryDefinitionChanged || queryChanged,
      section: sectionChanged || bucketChanged || queryDefinitionChanged,
      summary: sectionChanged || calcChanged || queryDefinitionChanged
    },
    output: {
      publish: sectionChanged || queryDefinitionChanged || queryChanged,
      source: sectionChanged || queryDefinitionChanged || queryChanged,
      table: sectionChanged || queryDefinitionChanged || queryChanged
    }
  }
}

export const syncViewPlan = (input: {
  context: DocumentReadContext
  previous?: ViewPlan
  activeViewId?: ViewId
}): {
  state?: ViewPlan
  change: ViewPlanChange
} => {
  const state = resolveViewPlan(input.context, input.activeViewId)
  return {
    state,
    change: diffViewPlan(input.previous, state)
  }
}

export const resolveViewPlan = (
  context: DocumentReadContext,
  activeViewId?: ViewId
): ViewPlan | undefined => {
  const view = activeViewId === context.activeViewId
    ? context.activeView
    : activeViewId
      ? context.reader.views.get(activeViewId)
      : undefined
  return view
    ? compileViewPlan(context.reader, view)
    : undefined
}

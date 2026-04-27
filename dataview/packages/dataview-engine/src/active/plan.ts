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
import {
  normalizeIndexDemand,
  resolveDefaultSearchFieldIds
} from '@dataview/engine/active/index/demand'
import type {
  BucketSpec,
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import type {
  DocumentReadContext,
  DocumentReader
} from '@dataview/engine/document/reader'
import { collection, string } from '@shared/core'


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

export interface ViewPlan {
  query: QueryPlan
  index: NormalizedIndexDemand
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
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
          return rule ? [rule.fieldId] : []
        })
      )
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
      ? [calculation.demand.create(fieldId as FieldId, metric)]
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
    ? [...viewApi.demand.display(view)]
    : []
  const filterBucketSpecs = collection.uniqueSorted(
    indexedFilters.flatMap(entry => (
      filterApi.rule.planDemand(entry.field, entry.rule).bucket
        ? [entry.fieldId]
        : []
    ))
  ).map(fieldId => createBucketSpec(fieldId))
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
        createBucketSpec(section.fieldId, section.mode, section.interval),
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
  const index = normalizeIndexDemand({
    document: reader.document(),
    reader
  }, {
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
  })

  return {
    query,
    index,
    ...(section ? { section } : {}),
    calcFields
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

import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import type {
  CalculationMetric,
  Field,
  FieldId,
  StatusField,
  View
} from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldOptions
} from '@dataview/core/field'
import {
  applyAggregateEntry,
  buildAggregateState
} from '../../index/aggregate'
import type {
  AggregateEntry,
  AggregateState,
  IndexState
} from '../../index/types'
import type {
  CalcState,
  SectionState
} from './state'
import type {
  SectionKey
} from '../types'

const EMPTY_DISPLAY = '--'

const formatNumber = (
  value: number,
  options: Intl.NumberFormatOptions = {}
) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  ...options
}).format(value)

const formatPercent = (value: number) => `${formatNumber(value * 100, {
  minimumFractionDigits: value !== 0 && value !== 1 && !Number.isInteger(value * 100)
    ? 1
    : 0,
  maximumFractionDigits: 1
})}%`

const emptyResult = (
  metric: CalculationMetric
): CalculationResult => ({
  kind: 'empty',
  metric,
  display: EMPTY_DISPLAY
})

const scalarResult = (
  metric: CalculationMetric,
  value: number
): CalculationResult => ({
  kind: 'scalar',
  metric,
  value,
  display: formatNumber(value)
})

const percentResult = (
  metric: CalculationMetric,
  numerator: number,
  denominator: number
): CalculationResult => (
  denominator <= 0
    ? emptyResult(metric)
    : {
        kind: 'percent',
        metric,
        numerator,
        denominator,
        value: numerator / denominator,
        display: formatPercent(numerator / denominator)
      }
)

const createDistributionResult = (input: {
  metric: CalculationMetric
  denominator: number
  items: readonly CalculationDistributionItem[]
}): CalculationResult => (
  input.denominator <= 0 || !input.items.length
    ? emptyResult(input.metric)
    : {
        kind: 'distribution',
        metric: input.metric,
        denominator: input.denominator,
        items: input.items,
        display: input.items
          .map(item => (
            input.metric === 'percentByOption'
              ? `${item.label} ${formatPercent(item.percent)}`
              : `${item.label} ${formatNumber(item.count)}`
          ))
          .join(' · ')
      }
)

const readNumericCount = (
  state: AggregateState
) => Array.from(state.numberCounts.values()).reduce((sum, count) => sum + count, 0)

const readMedian = (
  state: AggregateState
): number | undefined => {
  const total = readNumericCount(state)
  if (!total) {
    return undefined
  }

  const targets = total % 2 === 0
    ? [total / 2, total / 2 + 1]
    : [Math.floor(total / 2) + 1]
  const values: number[] = []
  let current = 0

  Array.from(state.numberCounts.entries())
    .sort((left, right) => left[0] - right[0])
    .forEach(([value, count]) => {
      const start = current + 1
      current += count

      targets.forEach(target => {
        if (target >= start && target <= current) {
          values.push(value)
        }
      })
    })

  if (!values.length) {
    return undefined
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const computeStatusDistribution = (
  field: StatusField | undefined,
  metric: CalculationMetric,
  state: AggregateState
): CalculationResult => {
  if (!field) {
    return emptyResult(metric)
  }

  const counts = new Map<string, number>()
  const orderedOptionIds: string[] = []

  getFieldOptions(field).forEach(option => {
    orderedOptionIds.push(option.id)
    counts.set(option.id, state.optionCounts.get(option.id) ?? 0)
  })

  state.optionCounts.forEach((_count, optionId) => {
    if (!orderedOptionIds.includes(optionId)) {
      orderedOptionIds.push(optionId)
    }
  })

  const denominator = Array.from(counts.values()).reduce((sum, count) => sum + count, 0)
  const items = orderedOptionIds
    .map(optionId => {
      const count = counts.get(optionId) ?? state.optionCounts.get(optionId) ?? 0
      if (count <= 0) {
        return undefined
      }

      const option = getFieldOption(field, optionId)
      return {
        key: optionId,
        label: option?.name ?? optionId,
        count,
        percent: denominator > 0 ? count / denominator : 0,
        ...(option?.color ? { color: option.color } : {})
      } satisfies CalculationDistributionItem
    })
    .filter((item): item is CalculationDistributionItem => Boolean(item))

  return createDistributionResult({
    metric,
    denominator,
    items
  })
}

export const computeCalculationFromState = (input: {
  field: Field | undefined
  metric: CalculationMetric
  state: AggregateState
}): CalculationResult => {
  const allCount = input.state.count
  const valueCount = input.state.nonEmpty
  const emptyCount = allCount - valueCount

  switch (input.metric) {
    case 'countAll':
      return scalarResult(input.metric, allCount)
    case 'countValues':
    case 'countNonEmpty':
      return scalarResult(input.metric, valueCount)
    case 'countEmpty':
      return scalarResult(input.metric, emptyCount)
    case 'percentEmpty':
      return percentResult(input.metric, emptyCount, allCount)
    case 'percentNonEmpty':
      return percentResult(input.metric, valueCount, allCount)
    case 'countUniqueValues':
      return scalarResult(input.metric, input.state.uniqueCounts.size)
    case 'sum': {
      const numericCount = readNumericCount(input.state)
      return numericCount
        ? scalarResult(input.metric, input.state.sum ?? 0)
        : emptyResult(input.metric)
    }
    case 'average': {
      const numericCount = readNumericCount(input.state)
      return numericCount
        ? scalarResult(input.metric, (input.state.sum ?? 0) / numericCount)
        : emptyResult(input.metric)
    }
    case 'median': {
      const value = readMedian(input.state)
      return value === undefined
        ? emptyResult(input.metric)
        : scalarResult(input.metric, value)
    }
    case 'min':
      return typeof input.state.min === 'number'
        ? scalarResult(input.metric, input.state.min)
        : emptyResult(input.metric)
    case 'max':
      return typeof input.state.max === 'number'
        ? scalarResult(input.metric, input.state.max)
        : emptyResult(input.metric)
    case 'range':
      return typeof input.state.min === 'number' && typeof input.state.max === 'number'
        ? scalarResult(input.metric, input.state.max - input.state.min)
        : emptyResult(input.metric)
    case 'countByOption':
    case 'percentByOption':
      return computeStatusDistribution(
        input.field?.kind === 'status' ? input.field : undefined,
        input.metric,
        input.state
      )
    default:
      return emptyResult(input.metric)
  }
}

const createCollection = (
  byField: ReadonlyMap<FieldId, CalculationResult>
): CalculationCollection => ({
  byField,
  get: fieldId => byField.get(fieldId)
})

const sameIds = (
  left: readonly string[],
  right: readonly string[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

const buildState = (input: {
  sections: SectionState
  view: View
  index: IndexState
}): CalcState => {
  const bySection = new Map<SectionKey, ReadonlyMap<FieldId, AggregateState>>()
  const calcFields = Object.entries(input.view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])

  input.sections.order.forEach(sectionKey => {
    const section = input.sections.byKey.get(sectionKey)
    if (!section) {
      return
    }

    const byField = new Map<FieldId, AggregateState>()
    calcFields.forEach(fieldId => {
      const entries = input.index.calculations.fields.get(fieldId)?.global.entries
      if (!entries) {
        return
      }

      let state = buildAggregateState(new Map())
      section.ids.forEach(recordId => {
        state = applyAggregateEntry({
          state,
          recordId,
          next: entries.get(recordId)
        })
      })

      byField.set(fieldId, state)
    })
    bySection.set(sectionKey, byField)
  })

  return {
    bySection
  }
}

const sameRecordMembership = (
  left: SectionState,
  right: SectionState
) => left.order.length === right.order.length
  && left.order.every((key, index) => {
    if (key !== right.order[index]) {
      return false
    }

    const leftNode = left.byKey.get(key)
    const rightNode = right.byKey.get(key)
    return Boolean(leftNode && rightNode && sameIds(leftNode.ids, rightNode.ids))
  })

const sameEntry = (
  left: AggregateEntry | undefined,
  right: AggregateEntry | undefined
) => JSON.stringify(left) === JSON.stringify(right)

export const syncCalcState = (input: {
  previous?: CalcState
  previousSections?: SectionState
  sections: SectionState
  view: View
  index: IndexState
  action: 'reuse' | 'sync' | 'rebuild'
  touchedRecords: ReadonlySet<string> | 'all'
  touchedFields: ReadonlySet<FieldId> | 'all'
}): CalcState => {
  const previousState = input.previous
  if (input.action === 'reuse' && previousState) {
    return previousState
  }

  const calcFields = Object.entries(input.view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])

  if (
    !input.previous
    || !input.previousSections
    || input.action === 'rebuild'
    || input.touchedRecords === 'all'
    || input.touchedFields === 'all'
    || !sameRecordMembership(input.previousSections, input.sections)
  ) {
    return buildState({
      sections: input.sections,
      view: input.view,
      index: input.index
    })
  }

  const previous = input.previous!
  const previousSections = input.previousSections!
  const touchedRecords = input.touchedRecords as ReadonlySet<string>
  const bySection = new Map(previous.bySection)

  input.sections.order.forEach(sectionKey => {
    const currentSection = input.sections.byKey.get(sectionKey)
    const previousSection = previousSections.byKey.get(sectionKey)
    if (!currentSection) {
      return
    }

    if (!previousSection || !sameIds(previousSection.ids, currentSection.ids)) {
      const rebuilt = buildState({
        sections: {
          order: [sectionKey],
          byKey: new Map([[sectionKey, currentSection]]),
          byRecord: new Map()
        },
        view: {
          ...input.view,
          calc: Object.fromEntries(calcFields.map(fieldId => [fieldId, input.view.calc[fieldId]!]))
        },
        index: input.index
      })
      bySection.set(sectionKey, rebuilt.bySection.get(sectionKey) ?? new Map())
      return
    }

    const previousByField = previous.bySection.get(sectionKey) ?? new Map()
    let changed = false
    const nextByField = new Map(previousByField)

    calcFields.forEach(fieldId => {
      if (input.touchedFields !== 'all' && !input.touchedFields.has(fieldId)) {
        return
      }

      let state = previousByField.get(fieldId)
      if (!state) {
        return
      }

      const entries = input.index.calculations.fields.get(fieldId)?.global.entries
      if (!entries) {
        return
      }

      touchedRecords.forEach(recordId => {
        if (!currentSection.ids.includes(recordId)) {
          return
        }

        const nextEntry = entries.get(recordId)
        const previousEntry = state?.entries.get(recordId)
        if (sameEntry(previousEntry, nextEntry)) {
          return
        }

        state = applyAggregateEntry({
          state,
          recordId,
          next: nextEntry
        })
      })

      if (state && state !== previousByField.get(fieldId)) {
        nextByField.set(fieldId, state)
        changed = true
      }
    })

    if (changed) {
      bySection.set(sectionKey, nextByField)
    }
  })

  return {
    bySection
  }
}

export const toPublishedCalculations = (input: {
  calc: CalcState
  fieldsById: ReadonlyMap<FieldId, Field>
  view: View
}): ReadonlyMap<SectionKey, CalculationCollection> => new Map(
  Array.from(input.calc.bySection.entries()).map(([sectionKey, states]) => [
    sectionKey,
    createCollection(new Map(
      Object.entries(input.view.calc).flatMap(([fieldId, metric]) => {
        if (!metric) {
          return []
        }

        const state = states.get(fieldId as FieldId)
        return state
          ? [[
              fieldId as FieldId,
              computeCalculationFromState({
                field: input.fieldsById.get(fieldId as FieldId),
                metric,
                state
              })
            ] as const]
          : []
      })
    ))
  ] as const)
)

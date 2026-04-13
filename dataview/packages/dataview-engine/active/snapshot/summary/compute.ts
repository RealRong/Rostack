import type {
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import type {
  CalculationMetric,
  FieldId,
  Field,
  View,
  StatusField
} from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldOptions
} from '@dataview/core/field'
import type {
  AggregateState
} from '../../index/contracts'

export const readCalcFields = (
  view: View
): readonly FieldId[] => Object.entries(view.calc)
  .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])

const EMPTY_DISPLAY = '--'
const NUMBER_FORMATTERS = new Map<string, Intl.NumberFormat>()

const getNumberFormatter = (
  options: Intl.NumberFormatOptions
): Intl.NumberFormat => {
  const key = JSON.stringify({
    maximumFractionDigits: options.maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits
  })
  const cached = NUMBER_FORMATTERS.get(key)
  if (cached) {
    return cached
  }

  const formatter = new Intl.NumberFormat(undefined, options)
  NUMBER_FORMATTERS.set(key, formatter)
  return formatter
}

const formatNumber = (
  value: number,
  options: Intl.NumberFormatOptions = {}
) => getNumberFormatter({
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

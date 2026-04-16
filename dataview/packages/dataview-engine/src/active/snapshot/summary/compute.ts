import type {
  CalculationDistributionItem,
  CalculationResult
} from '@dataview/core/calculation'
import type {
  CalculationMetric,
  Field,
  FieldId,
  View
} from '@dataview/core/contracts'
import {
  getFieldOption,
  getFieldOptions
} from '@dataview/core/field'
import type {
  FieldReducerState
} from '@dataview/engine/active/shared/calculation'

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
  state: FieldReducerState
) => {
  const counts = state.numeric?.counts
  if (!counts?.size) {
    return 0
  }

  let total = 0
  counts.forEach(count => {
    total += count
  })
  return total
}

const readMedian = (
  state: FieldReducerState
): number | undefined => {
  const counts = state.numeric?.counts
  if (!counts?.size) {
    return undefined
  }

  const total = readNumericCount(state)
  if (!total) {
    return undefined
  }

  const targets = total % 2 === 0
    ? [total / 2, total / 2 + 1]
    : [Math.floor(total / 2) + 1]
  const values: number[] = []
  let current = 0

  ;[...counts.entries()]
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

const readNumericRange = (
  state: FieldReducerState
): {
  min?: number
  max?: number
} => {
  const counts = state.numeric?.counts
  if (!counts?.size) {
    return {}
  }

  const values = [...counts.keys()].sort((left, right) => left - right)
  return {
    min: values[0],
    max: values[values.length - 1]
  }
}

const computeOptionDistribution = (input: {
  field: Extract<Field, {
    kind: 'select' | 'multiSelect' | 'status'
  }> | undefined
  metric: CalculationMetric
  state: FieldReducerState
}): CalculationResult => {
  if (!input.field) {
    return emptyResult(input.metric)
  }

  const counts = input.state.option?.counts
  if (!counts?.size) {
    return emptyResult(input.metric)
  }

  const orderedOptionIds: string[] = []
  getFieldOptions(input.field).forEach(option => {
    orderedOptionIds.push(option.id)
  })
  counts.forEach((_count, optionId) => {
    if (!orderedOptionIds.includes(optionId)) {
      orderedOptionIds.push(optionId)
    }
  })

  let denominator = 0
  const items = orderedOptionIds
    .map(optionId => {
      const count = counts.get(optionId) ?? 0
      if (count <= 0) {
        return undefined
      }

      denominator += count
      const option = getFieldOption(input.field, optionId)
      return {
        key: optionId,
        label: option?.name ?? optionId,
        count,
        percent: 0,
        ...(option?.color ? { color: option.color } : {})
      } satisfies CalculationDistributionItem
    })
    .filter((item): item is CalculationDistributionItem => Boolean(item))
    .map(item => ({
      ...item,
      percent: denominator > 0 ? item.count / denominator : 0
    }))

  return createDistributionResult({
    metric: input.metric,
    denominator,
    items
  })
}

export const computeCalculationFromState = (input: {
  field: Field | undefined
  metric: CalculationMetric
  state: FieldReducerState
}): CalculationResult => {
  const allCount = input.state.count?.count ?? 0
  const valueCount = input.state.count?.nonEmpty ?? 0
  const emptyCount = allCount - valueCount

  switch (input.metric) {
    case 'countAll':
      return input.state.count
        ? scalarResult(input.metric, allCount)
        : emptyResult(input.metric)
    case 'countValues':
    case 'countNonEmpty':
      return input.state.count
        ? scalarResult(input.metric, valueCount)
        : emptyResult(input.metric)
    case 'countEmpty':
      return input.state.count
        ? scalarResult(input.metric, emptyCount)
        : emptyResult(input.metric)
    case 'percentEmpty':
      return input.state.count
        ? percentResult(input.metric, emptyCount, allCount)
        : emptyResult(input.metric)
    case 'percentNonEmpty':
      return input.state.count
        ? percentResult(input.metric, valueCount, allCount)
        : emptyResult(input.metric)
    case 'countUniqueValues':
      return input.state.unique
        ? scalarResult(input.metric, input.state.unique.counts.size)
        : emptyResult(input.metric)
    case 'sum': {
      const numericCount = readNumericCount(input.state)
      return numericCount
        ? scalarResult(input.metric, input.state.numeric?.sum ?? 0)
        : emptyResult(input.metric)
    }
    case 'average': {
      const numericCount = readNumericCount(input.state)
      return numericCount
        ? scalarResult(input.metric, (input.state.numeric?.sum ?? 0) / numericCount)
        : emptyResult(input.metric)
    }
    case 'median': {
      const value = readMedian(input.state)
      return value === undefined
        ? emptyResult(input.metric)
        : scalarResult(input.metric, value)
    }
    case 'min': {
      const range = readNumericRange(input.state)
      return range.min === undefined
        ? emptyResult(input.metric)
        : scalarResult(input.metric, range.min)
    }
    case 'max': {
      const range = readNumericRange(input.state)
      return range.max === undefined
        ? emptyResult(input.metric)
        : scalarResult(input.metric, range.max)
    }
    case 'range': {
      const range = readNumericRange(input.state)
      return range.min === undefined || range.max === undefined
        ? emptyResult(input.metric)
        : scalarResult(input.metric, range.max - range.min)
    }
    case 'countByOption':
    case 'percentByOption':
      return computeOptionDistribution({
        field: input.field?.kind === 'select' || input.field?.kind === 'multiSelect' || input.field?.kind === 'status'
          ? input.field
          : undefined,
        metric: input.metric,
        state: input.state
      })
    default:
      return emptyResult(input.metric)
  }
}

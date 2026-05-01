import type {
  CalculationDistributionItem,
  CalculationResult
} from './calcContracts'
import type {
  CalculationDemand,
  FieldReducerState,
  ReducerCapabilitySet
} from './calcReducer'
import type {
  CalculationMetric,
  Field,
  FieldId,
  FieldOption,
  ViewCalc
} from '@dataview/core/types/state'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import {
  isJsonObject
} from '@dataview/core/view/shared'
import type {
  Token
} from '@shared/i18n'

export interface CalculationMetricSpec {
  capabilities: ReducerCapabilitySet
  supports: (field: Field | undefined) => boolean
  compute: (input: {
    field: Field | undefined
    state: FieldReducerState
  }) => CalculationResult
}

const CALCULATION_METRICS = [
  'countAll',
  'countValues',
  'countUniqueValues',
  'countEmpty',
  'countNonEmpty',
  'percentEmpty',
  'percentNonEmpty',
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range',
  'countByOption',
  'percentByOption'
] as const satisfies readonly CalculationMetric[]

const CALCULATION_METRIC_SET = new Set<CalculationMetric>(CALCULATION_METRICS)

const emptyResult = (
  metric: CalculationMetric
): CalculationResult => ({
  kind: 'empty',
  metric
})

const scalarResult = (
  metric: CalculationMetric,
  value: number
): CalculationResult => ({
  kind: 'scalar',
  metric,
  value
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
        value: numerator / denominator
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
        items: input.items
      }
)

const readNumericCount = (
  state: FieldReducerState
): number => {
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

  const options = fieldApi.option.read.list(input.field)
  const optionIds = new Set(options.map((option: FieldOption) => option.id))
  const orderedOptionIds: string[] = options.map((option: FieldOption) => option.id)
  counts.forEach((_count, optionId) => {
    if (!optionIds.has(optionId)) {
      orderedOptionIds.push(optionId)
    }
  })

  const toValueToken = (
    optionId: string
  ): Token => options.find((option: FieldOption) => option.id === optionId)?.name ?? optionId

  let denominator = 0
  const items = orderedOptionIds
    .map(optionId => {
      const count = counts.get(optionId) ?? 0
      if (count <= 0) {
        return undefined
      }

      denominator += count
      const option = options.find((entry: FieldOption) => entry.id === optionId)
      return {
        key: optionId,
        value: toValueToken(optionId),
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

const supportsNumericMetric = (
  field: Field | undefined
): boolean => field?.kind === 'number'

const supportsOptionMetric = (
  field: Field | undefined
): boolean => fieldSpec.calculation.supportsOptionIds(field)

const createCountMetric = (
  metric: CalculationMetric,
  readValue: (state: FieldReducerState) => number | undefined
): CalculationMetricSpec => ({
  capabilities: {
    count: true
  },
  supports: () => true,
  compute: ({ state }) => {
    const value = readValue(state)
    return value === undefined
      ? emptyResult(metric)
      : scalarResult(metric, value)
  }
})

const metricSpecs = {
  countAll: createCountMetric('countAll', state => state.count?.count),
  countValues: createCountMetric('countValues', state => state.count?.nonEmpty),
  countNonEmpty: createCountMetric('countNonEmpty', state => state.count?.nonEmpty),
  countEmpty: createCountMetric('countEmpty', state => (
    state.count
      ? state.count.count - state.count.nonEmpty
      : undefined
  )),
  percentEmpty: {
    capabilities: {
      count: true
    },
    supports: () => true,
    compute: ({ state }) => {
      if (!state.count) {
        return emptyResult('percentEmpty')
      }

      const emptyCount = state.count.count - state.count.nonEmpty
      return percentResult('percentEmpty', emptyCount, state.count.count)
    }
  },
  percentNonEmpty: {
    capabilities: {
      count: true
    },
    supports: () => true,
    compute: ({ state }) => (
      state.count
        ? percentResult('percentNonEmpty', state.count.nonEmpty, state.count.count)
        : emptyResult('percentNonEmpty')
    )
  },
  countUniqueValues: {
    capabilities: {
      unique: true
    },
    supports: () => true,
    compute: ({ state }) => (
      state.unique
        ? scalarResult('countUniqueValues', state.unique.counts.size)
        : emptyResult('countUniqueValues')
    )
  },
  sum: {
    capabilities: {
      numeric: true
    },
    supports: supportsNumericMetric,
    compute: ({ state }) => {
      const numericCount = readNumericCount(state)
      return numericCount
        ? scalarResult('sum', state.numeric?.sum ?? 0)
        : emptyResult('sum')
    }
  },
  average: {
    capabilities: {
      numeric: true
    },
    supports: supportsNumericMetric,
    compute: ({ state }) => {
      const numericCount = readNumericCount(state)
      return numericCount
        ? scalarResult('average', (state.numeric?.sum ?? 0) / numericCount)
        : emptyResult('average')
    }
  },
  median: {
    capabilities: {
      numeric: true
    },
    supports: supportsNumericMetric,
    compute: ({ state }) => {
      const value = readMedian(state)
      return value === undefined
        ? emptyResult('median')
        : scalarResult('median', value)
    }
  },
  min: {
    capabilities: {
      numeric: true
    },
    supports: supportsNumericMetric,
    compute: ({ state }) => {
      const range = readNumericRange(state)
      return range.min === undefined
        ? emptyResult('min')
        : scalarResult('min', range.min)
    }
  },
  max: {
    capabilities: {
      numeric: true
    },
    supports: supportsNumericMetric,
    compute: ({ state }) => {
      const range = readNumericRange(state)
      return range.max === undefined
        ? emptyResult('max')
        : scalarResult('max', range.max)
    }
  },
  range: {
    capabilities: {
      numeric: true
    },
    supports: supportsNumericMetric,
    compute: ({ state }) => {
      const range = readNumericRange(state)
      return range.min === undefined || range.max === undefined
        ? emptyResult('range')
        : scalarResult('range', range.max - range.min)
    }
  },
  countByOption: {
    capabilities: {
      option: true
    },
    supports: supportsOptionMetric,
    compute: ({ field, state }) => computeOptionDistribution({
      field: field?.kind === 'select' || field?.kind === 'multiSelect' || field?.kind === 'status'
        ? field
        : undefined,
      metric: 'countByOption',
      state
    })
  },
  percentByOption: {
    capabilities: {
      option: true
    },
    supports: supportsOptionMetric,
    compute: ({ field, state }) => computeOptionDistribution({
      field: field?.kind === 'select' || field?.kind === 'multiSelect' || field?.kind === 'status'
        ? field
        : undefined,
      metric: 'percentByOption',
      state
    })
  }
} as const satisfies Record<CalculationMetric, CalculationMetricSpec>

export const isCalculationMetric = (value: unknown): value is CalculationMetric => (
  typeof value === 'string' && CALCULATION_METRIC_SET.has(value as CalculationMetric)
)

export const getCalculationMetricSpec = (
  metric: CalculationMetric
): CalculationMetricSpec => metricSpecs[metric]

export const getFieldCalculationMetrics = (
  field: Field | undefined
): readonly CalculationMetric[] => CALCULATION_METRICS.filter(metric => (
  getCalculationMetricSpec(metric).supports(field)
))

export const supportsFieldCalculationMetric = (
  field: Field | undefined,
  metric: CalculationMetric
): boolean => getCalculationMetricSpec(metric).supports(field)

export const createCalculationDemand = (
  fieldId: FieldId,
  metric: CalculationMetric
): CalculationDemand => ({
  fieldId,
  capabilities: getCalculationMetricSpec(metric).capabilities
})

export const computeCalculationFromState = (input: {
  field: Field | undefined
  metric: CalculationMetric
  state: FieldReducerState
}): CalculationResult => getCalculationMetricSpec(input.metric).compute({
  field: input.field,
  state: input.state
})

export const normalizeViewCalculations = (
  value: unknown,
  context: {
    fields?: ReadonlyMap<FieldId, Field>
  } = {}
): ViewCalc => {
  if (!isJsonObject(value)) {
    return {}
  }

  const next: ViewCalc = {}

  Object.entries(value).forEach(([fieldId, metric]) => {
    if (!isCalculationMetric(metric)) {
      return
    }

    const resolvedField = context.fields?.get(fieldId as FieldId)
    if (!resolvedField) {
      return
    }

    if (!supportsFieldCalculationMetric(resolvedField, metric)) {
      return
    }

    next[fieldId as FieldId] = metric
  })

  return next
}

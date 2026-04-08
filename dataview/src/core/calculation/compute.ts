import type {
  CalculationMetric,
  Field,
  FieldId,
  Row,
  StatusField,
  ViewCalc
} from '@dataview/core/contracts/state'
import {
  getFieldOption,
  getFieldOptions,
  getRecordFieldValue,
  isEmptyFieldValue,
  readBooleanValue,
  readNumberValue
} from '@dataview/core/field'
import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from './contracts'

const EMPTY_DISPLAY = '--'

const asPlainString = (value: unknown) => (
  typeof value === 'string'
    ? value.trim()
    : ''
)

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

const stableSerialize = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}

const uniqueValueKey = (
  field: Field | undefined,
  value: unknown
): string => {
  switch (field?.kind) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return `text:${asPlainString(value)}`
    case 'number': {
      const numeric = readNumberValue(value)
      return numeric === undefined ? stableSerialize(value) : `number:${numeric}`
    }
    case 'boolean': {
      const booleanValue = readBooleanValue(value)
      return booleanValue === undefined ? stableSerialize(value) : `boolean:${booleanValue}`
    }
    case 'select':
    case 'status':
      return `option:${asPlainString(value)}`
    case 'multiSelect': {
      if (!Array.isArray(value)) {
        return stableSerialize(value)
      }

      const normalized = value
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
      return `multi:${JSON.stringify(normalized)}`
    }
    default:
      return stableSerialize(value)
  }
}

const nonEmptyValues = (
  rows: readonly Row[],
  fieldId: FieldId
) => rows
  .map(row => getRecordFieldValue(row, fieldId))
  .filter(value => !isEmptyFieldValue(value))

const numericValues = (
  rows: readonly Row[],
  fieldId: FieldId
) => rows
  .map(row => readNumberValue(getRecordFieldValue(row, fieldId)))
  .filter((value): value is number => value !== undefined)

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

const computeStatusDistribution = (
  field: StatusField | undefined,
  metric: CalculationMetric,
  rows: readonly Row[],
  fieldId: FieldId
): CalculationResult => {
  if (!field) {
    return emptyResult(metric)
  }

  const counts = new Map<string, number>()
  const orderedOptionIds: string[] = []

  getFieldOptions(field).forEach(option => {
    orderedOptionIds.push(option.id)
    counts.set(option.id, 0)
  })

  nonEmptyValues(rows, fieldId).forEach(value => {
    const optionId = asPlainString(value)
    if (!optionId) {
      return
    }

    counts.set(optionId, (counts.get(optionId) ?? 0) + 1)
    if (!orderedOptionIds.includes(optionId)) {
      orderedOptionIds.push(optionId)
    }
  })

  const denominator = Array.from(counts.values()).reduce((sum, count) => sum + count, 0)
  const items = orderedOptionIds
    .map(optionId => {
      const count = counts.get(optionId) ?? 0
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

export const computeCalculation = (input: {
  field: Field | undefined
  fieldId: FieldId
  metric: CalculationMetric
  rows: readonly Row[]
}): CalculationResult => {
  const allCount = input.rows.length
  const values = nonEmptyValues(input.rows, input.fieldId)
  const valueCount = values.length
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
      return scalarResult(
        input.metric,
        new Set(values.map(value => uniqueValueKey(input.field, value))).size
      )
    case 'sum':
    case 'average':
    case 'median':
    case 'min':
    case 'max':
    case 'range': {
      const numbers = numericValues(input.rows, input.fieldId)
      if (!numbers.length) {
        return emptyResult(input.metric)
      }

      const sorted = [...numbers].sort((left, right) => left - right)
      const sum = numbers.reduce((total, value) => total + value, 0)
      const min = sorted[0] ?? 0
      const max = sorted[sorted.length - 1] ?? 0

      switch (input.metric) {
        case 'sum':
          return scalarResult(input.metric, sum)
        case 'average':
          return scalarResult(input.metric, sum / numbers.length)
        case 'median': {
          const middle = Math.floor(sorted.length / 2)
          const median = sorted.length % 2 === 0
            ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
            : (sorted[middle] ?? 0)
          return scalarResult(input.metric, median)
        }
        case 'min':
          return scalarResult(input.metric, min)
        case 'max':
          return scalarResult(input.metric, max)
        case 'range':
          return scalarResult(input.metric, max - min)
        default:
          return emptyResult(input.metric)
      }
    }
    case 'countByOption':
    case 'percentByOption':
      return computeStatusDistribution(
        input.field?.kind === 'status' ? input.field : undefined,
        input.metric,
        input.rows,
        input.fieldId
      )
    default:
      return emptyResult(input.metric)
  }
}

export const computeCalculationsForFields = (input: {
  calculations: ViewCalc
  fields: ReadonlyMap<FieldId, Field>
  rows: readonly Row[]
}): CalculationCollection => {
  const byField = new Map<FieldId, CalculationResult>()

  Object.entries(input.calculations).forEach(([fieldId, metric]) => {
    if (!metric) {
      return
    }

    byField.set(fieldId as FieldId, computeCalculation({
      field: input.fields.get(fieldId as FieldId),
      fieldId: fieldId as FieldId,
      metric,
      rows: input.rows
    }))
  })

  return {
    byField,
    get: fieldId => byField.get(fieldId)
  }
}

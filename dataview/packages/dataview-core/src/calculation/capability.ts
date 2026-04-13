import type {
  CalculationMetric,
  Field,
  FieldId,
  ViewCalc
} from '#core/contracts/state'
import { isJsonObject } from '#core/view/shared'

const BASE_METRICS = [
  'countAll',
  'countValues',
  'countUniqueValues',
  'countEmpty',
  'countNonEmpty',
  'percentEmpty',
  'percentNonEmpty'
] as const satisfies readonly CalculationMetric[]

const NUMBER_METRICS = [
  'sum',
  'average',
  'median',
  'min',
  'max',
  'range'
] as const satisfies readonly CalculationMetric[]

const STATUS_METRICS = [
  'countByOption',
  'percentByOption'
] as const satisfies readonly CalculationMetric[]

const CALCULATION_METRICS = [
  ...BASE_METRICS,
  ...NUMBER_METRICS,
  ...STATUS_METRICS
] as const satisfies readonly CalculationMetric[]

const CALCULATION_METRIC_SET = new Set<CalculationMetric>(CALCULATION_METRICS)

export const isCalculationMetric = (value: unknown): value is CalculationMetric => (
  typeof value === 'string' && CALCULATION_METRIC_SET.has(value as CalculationMetric)
)

export const getFieldCalculationMetrics = (
  field: Field | undefined
): readonly CalculationMetric[] => {
  switch (field?.kind) {
    case 'number':
      return [...BASE_METRICS, ...NUMBER_METRICS]
    case 'status':
      return [...BASE_METRICS, ...STATUS_METRICS]
    default:
      return [...BASE_METRICS]
  }
}

export const supportsFieldCalculationMetric = (
  field: Field | undefined,
  metric: CalculationMetric
) => getFieldCalculationMetrics(field).includes(metric)

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

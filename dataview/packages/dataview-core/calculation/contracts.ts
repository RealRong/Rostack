import type {
  CalculationMetric,
  FieldId
} from '#core/contracts/state'

export interface CalculationDistributionItem {
  key: string
  label: string
  count: number
  percent: number
  color?: string
}

export type CalculationResult =
  | {
      kind: 'scalar'
      metric: CalculationMetric
      value: number
      display: string
    }
  | {
      kind: 'percent'
      metric: CalculationMetric
      numerator: number
      denominator: number
      value: number
      display: string
    }
  | {
      kind: 'distribution'
      metric: CalculationMetric
      denominator: number
      items: readonly CalculationDistributionItem[]
      display: string
    }
  | {
      kind: 'empty'
      metric: CalculationMetric
      display: string
    }

export interface CalculationCollection {
  byField: ReadonlyMap<FieldId, CalculationResult>
  get: (fieldId: FieldId) => CalculationResult | undefined
}

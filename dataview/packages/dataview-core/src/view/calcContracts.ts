import type {
  CalculationMetric,
  FieldId
} from '@dataview/core/types/state'
import type {
  Token
} from '@shared/i18n'

export interface CalculationDistributionItem {
  key: string
  value: Token
  count: number
  percent: number
  color?: string
}

export type CalculationResult =
  | {
      kind: 'scalar'
      metric: CalculationMetric
      value: number
    }
  | {
      kind: 'percent'
      metric: CalculationMetric
      numerator: number
      denominator: number
      value: number
    }
  | {
      kind: 'distribution'
      metric: CalculationMetric
      denominator: number
      items: readonly CalculationDistributionItem[]
    }
  | {
      kind: 'empty'
      metric: CalculationMetric
    }

export interface CalculationCollection {
  byField: ReadonlyMap<FieldId, CalculationResult>
  get: (fieldId: FieldId) => CalculationResult | undefined
}

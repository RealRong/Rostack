import type {
  CalculationMetric
} from '@dataview/core/contracts'
import {
  token,
  type Token
} from '@shared/i18n'
import {
  defineMetaCollection
} from '@dataview/meta/shared'

export interface CalculationMetricDescriptor {
  id: CalculationMetric | string
  token: Token
}

const CALCULATION_METRICS = [
  {
    id: 'countAll',
    token: token('meta.calculation.metric.countAll', 'Count all')
  },
  {
    id: 'countValues',
    token: token('meta.calculation.metric.countValues', 'Count values')
  },
  {
    id: 'countUniqueValues',
    token: token('meta.calculation.metric.countUniqueValues', 'Count unique values')
  },
  {
    id: 'countEmpty',
    token: token('meta.calculation.metric.countEmpty', 'Count empty')
  },
  {
    id: 'countNonEmpty',
    token: token('meta.calculation.metric.countNonEmpty', 'Count non-empty')
  },
  {
    id: 'percentEmpty',
    token: token('meta.calculation.metric.percentEmpty', 'Percent empty')
  },
  {
    id: 'percentNonEmpty',
    token: token('meta.calculation.metric.percentNonEmpty', 'Percent non-empty')
  },
  {
    id: 'sum',
    token: token('meta.calculation.metric.sum', 'Sum')
  },
  {
    id: 'average',
    token: token('meta.calculation.metric.average', 'Average')
  },
  {
    id: 'median',
    token: token('meta.calculation.metric.median', 'Median')
  },
  {
    id: 'min',
    token: token('meta.calculation.metric.min', 'Minimum')
  },
  {
    id: 'max',
    token: token('meta.calculation.metric.max', 'Maximum')
  },
  {
    id: 'range',
    token: token('meta.calculation.metric.range', 'Range')
  },
  {
    id: 'countByOption',
    token: token('meta.calculation.metric.countByOption', 'Count by option')
  },
  {
    id: 'percentByOption',
    token: token('meta.calculation.metric.percentByOption', 'Percent by option')
  }
] as const satisfies readonly CalculationMetricDescriptor[]

export const calculation = {
  metric: defineMetaCollection(CALCULATION_METRICS, {
    fallback: (id?: string) => ({
      id: id ?? 'unknown',
      token: token('meta.calculation.metric.unknown', id ?? 'Unknown')
    })
  })
} as const

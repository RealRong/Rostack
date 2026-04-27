import {
  computeCalculationFromState,
  createCalculationDemand,
  getCalculationMetricSpec,
  getFieldCalculationMetrics,
  isCalculationMetric,
  normalizeViewCalculations,
  supportsFieldCalculationMetric,
  type CalculationMetricSpec
} from './calcCapability'
import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from './calcContracts'
import type {
  CalculationMetric,
  Field
} from '@dataview/core/types'
import {
  buildFieldReducerState,
  createCalculationEntry,
  createFieldReducerBuilder,
  EMPTY_COUNT_REDUCER_STATE,
  EMPTY_NUMERIC_REDUCER_STATE,
  EMPTY_OPTION_REDUCER_STATE,
  EMPTY_UNIQUE_REDUCER_STATE,
  getEmptyFieldReducerState,
  mergeReducerCapabilities,
  normalizeCalculationDemands,
  reducerCapabilityKey,
  sameCalculationDemand,
  sameCalculationEntry,
  sameReducerCapabilities
} from './calcReducer'
import type {
  CalculationDemand,
  CalculationEntry,
  CountReducerState,
  FieldReducerBuilder,
  FieldReducerState,
  NumericReducerState,
  OptionReducerState,
  ReducerCapabilitySet,
  UniqueReducerState
} from './calcReducer'

export type {
  CalculationCollection,
  CalculationDemand,
  CalculationDistributionItem,
  CalculationEntry,
  CalculationMetricSpec,
  CalculationResult,
  CountReducerState,
  FieldReducerBuilder,
  FieldReducerState,
  NumericReducerState,
  OptionReducerState,
  ReducerCapabilitySet,
  UniqueReducerState
}

export const calculation = {
  view: {
    normalize: normalizeViewCalculations
  },
  metric: {
    is: isCalculationMetric,
    get: getCalculationMetricSpec,
    forField: getFieldCalculationMetrics,
    supports: supportsFieldCalculationMetric,
    compute: (
      field: Field | undefined,
      metric: CalculationMetric,
      state: FieldReducerState
    ) => computeCalculationFromState({
      field,
      metric,
      state
    })
  },
  capability: {
    merge: mergeReducerCapabilities,
    key: reducerCapabilityKey,
    same: sameReducerCapabilities
  },
  demand: {
    create: createCalculationDemand,
    normalize: normalizeCalculationDemands,
    same: sameCalculationDemand
  },
  entry: {
    create: createCalculationEntry,
    same: sameCalculationEntry
  },
  state: {
    empty: getEmptyFieldReducerState,
    build: buildFieldReducerState,
    builder: createFieldReducerBuilder
  },
  initial: {
    count: EMPTY_COUNT_REDUCER_STATE,
    unique: EMPTY_UNIQUE_REDUCER_STATE,
    numeric: EMPTY_NUMERIC_REDUCER_STATE,
    option: EMPTY_OPTION_REDUCER_STATE
  }
} as const

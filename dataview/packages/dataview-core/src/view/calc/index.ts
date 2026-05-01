import {
  computeCalculationFromState,
  createCalculationDemand,
  getCalculationMetricSpec,
  getFieldCalculationMetrics,
  isCalculationMetric,
  normalizeViewCalculations,
  supportsFieldCalculationMetric,
  type CalculationMetricSpec
} from './capability'
import type {
  CalculationCollection,
  CalculationDistributionItem,
  CalculationResult
} from './contracts'
import type {
  CalculationMetric,
  Field,
  FieldId,
  ViewCalc
} from '@dataview/core/types'
import { equal } from '@shared/core'
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
} from './reducer'
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
} from './reducer'

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

export const setMetric = (
  calc: ViewCalc,
  fieldId: FieldId,
  metric: CalculationMetric | null
): ViewCalc => {
  const nextCalc = {
    ...calc
  }

  if (metric === null) {
    delete nextCalc[fieldId]
  } else {
    nextCalc[fieldId] = metric
  }

  return nextCalc
}

export const clone = (
  calc: ViewCalc
): ViewCalc => ({
  ...calc
})

export const same = (
  left: ViewCalc,
  right: ViewCalc
): boolean => equal.sameShallowRecord(left, right)

export const calculation = {
  view: {
    normalize: normalizeViewCalculations,
    clone,
    same,
    set: setMetric
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

export { calculation as calc }

import type * as runtime from '../contracts/runtime'
import type * as trace from '../contracts/trace'

export const assertPhaseOrder = <TPhaseName extends string>(
  run: trace.Run<TPhaseName>,
  expected: readonly TPhaseName[]
) => {
  const actual = run.phases.map((phase) => phase.name)

  if (actual.length !== expected.length) {
    throw new Error(`Expected ${expected.length} phases but received ${actual.length}.`)
  }

  expected.forEach((phaseName, index) => {
    if (actual[index] === phaseName) {
      return
    }

    throw new Error(`Expected phase ${phaseName} at index ${index}, received ${actual[index]}.`)
  })
}

export const assertPublishedOnce = <
  TSnapshot,
  TChange,
  TPhaseName extends string = string,
  TPhaseMetrics = unknown
>(
  results: readonly runtime.Result<TSnapshot, TChange, TPhaseName, TPhaseMetrics>[]
) => {
  if (results.length === 1) {
    return
  }

  throw new Error(`Expected exactly one published result, received ${results.length}.`)
}

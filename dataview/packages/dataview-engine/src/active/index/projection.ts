import type { DataDoc } from '@dataview/core/contracts'
import type { IndexTrace } from '@dataview/engine/contracts/performance'
import { createProjectionRuntime, type ProjectionSpec } from '@shared/projection'
import type { BaseImpact } from '@dataview/engine/active/projection/impact'
import {
  emptyNormalizedIndexDemand
} from './demand'
import type {
  IndexDelta,
  IndexState,
  NormalizedIndexDemand
} from './contracts'
import {
  createIndexState,
  deriveIndex
} from './runtime'

export interface IndexProjectionInput {
  document: DataDoc
  demand?: NormalizedIndexDemand
  impact?: BaseImpact
}

interface IndexProjectionState {
  demand: NormalizedIndexDemand
  current?: IndexState
  delta?: IndexDelta
  trace?: IndexTrace
}

export interface IndexProjectionCapture {
  state: IndexState
  demand: NormalizedIndexDemand
  delta?: IndexDelta
  trace?: IndexTrace
}

const indexProjectionSpec: ProjectionSpec<
  IndexProjectionInput,
  IndexProjectionState,
  {},
  {},
  'index',
  {
    index: undefined
  },
  undefined,
  IndexProjectionCapture
> = {
  createState: () => ({
    demand: emptyNormalizedIndexDemand()
  }),
  createRead: () => ({}),
  surface: {},
  plan: () => ({
    phases: ['index']
  }),
  capture: ({ state }) => {
    if (!state.current) {
      throw new Error('Index projection is not initialized.')
    }

    return {
      state: state.current,
      demand: state.demand,
      ...(state.delta
        ? {
            delta: state.delta
          }
        : {}),
      ...(state.trace
        ? {
            trace: state.trace
          }
        : {})
    }
  },
  phases: {
    index: {
      run: ({ input, state }) => {
        const demand = input.demand ?? state.demand

        if (!state.current || !input.impact) {
          state.current = createIndexState(input.document, demand)
          state.demand = demand
          state.delta = undefined
          state.trace = undefined

          return {
            action: 'rebuild'
          }
        }

        const next = deriveIndex({
          previous: state.current,
          previousDemand: state.demand,
          document: input.document,
          impact: input.impact,
          demand
        })

        state.current = next.state
        state.demand = demand
        state.delta = next.delta
        state.trace = next.trace

        return {
          action: next.trace?.changed
            ? 'sync'
            : 'reuse'
        }
      }
    }
  }
}

export const createIndexProjectionRuntime = () => createProjectionRuntime(
  indexProjectionSpec
)

import type { DataDoc } from '@dataview/core/types'
import type { DataviewTrace } from '@dataview/core/operations'
import type { DocumentDelta } from '@dataview/engine/contracts/delta'
import { createProjectionRuntime, type ProjectionSpec } from '@shared/projection'
import { projectDocumentDelta } from '../documentDelta'

export interface DocumentProjectionInput {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}

interface DocumentProjectionState {
  delta?: DocumentDelta
}

const documentProjectionSpec: ProjectionSpec<
  DocumentProjectionInput,
  DocumentProjectionState,
  {},
  {},
  'document',
  {
    document: undefined
  },
  undefined,
  DocumentDelta | undefined
> = {
  createState: () => ({}),
  createRead: () => ({}),
  surface: {},
  plan: () => ({
    phases: ['document']
  }),
  capture: ({ state }) => state.delta,
  phases: {
    document: {
      run: ({ input, state }) => {
        state.delta = projectDocumentDelta(input)

        return {
          action: state.delta
            ? input.trace.reset
              ? 'rebuild'
              : 'sync'
            : 'reuse'
        }
      }
    }
  }
}

export const createDocumentProjectionRuntime = () => createProjectionRuntime(
  documentProjectionSpec
)

import type {
  MutationDelta,
  MutationDeltaSource
} from './createDelta'
import {
  createMutationDeltaFromState,
  resolveMutationDeltaSource
} from './createDelta'
import type {
  MutationSchema
} from '../schema/node'
import type {
  MutationWrite
} from '../writer/writes'

export const mergeMutationDeltas = <TSchema extends MutationSchema>(
  schema: TSchema,
  ...inputs: readonly MutationDeltaSource<TSchema>[]
): MutationDelta<TSchema> => createMutationDeltaFromState(
  schema,
  inputs.reduce(
    (state, input) => {
      const next = resolveMutationDeltaSource(schema, input)
      return {
        reset: state.reset || next.reset,
        writes: [
          ...state.writes,
          ...next.writes
        ]
      }
    },
    {
      reset: false,
      writes: []
    } as {
      reset: boolean
      writes: readonly MutationWrite[]
    }
  )
)

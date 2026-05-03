import type {
  MutationDeltaInput,
  MutationDeltaSource
} from './createDelta'

export const mergeMutationDeltas = (
  ...inputs: readonly MutationDeltaSource[]
): MutationDeltaInput => inputs.reduce<MutationDeltaInput>(
  (current, input) => {
    const normalized: MutationDeltaInput = Array.isArray(input)
      ? {
          writes: input
        }
      : input as MutationDeltaInput

    return {
      ...(current.reset || normalized.reset ? { reset: true } : {}),
      writes: [
        ...(current.writes ?? []),
        ...(normalized.writes ?? [])
      ]
    }
  },
  {}
)

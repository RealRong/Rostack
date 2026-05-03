import type {
  MutationWrite
} from '@shared/mutation'

type CheckpointWrites =
  | readonly MutationWrite[]
  | {
      readonly steps: readonly MutationWrite[]
    }

export const isCheckpointProgram = (
  input: CheckpointWrites
): boolean => {
  const writes: readonly MutationWrite[] = 'steps' in input
    ? input.steps
    : input

  return (
    writes.length > 0
    && writes.every((write: MutationWrite) => (
      write.kind === 'entity.replace'
      && write.node.kind === 'singleton'
    ))
  )
}

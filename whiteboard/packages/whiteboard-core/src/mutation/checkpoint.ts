import type {
  MutationProgram
} from '@shared/mutation'

export const isCheckpointProgram = (
  program: MutationProgram
): boolean => (
  program.steps.length > 0
  && program.steps.every((step) => (
    step.type === 'entity.create'
    && step.entity.type === 'document'
    && step.entity.id === 'document'
  ))
)

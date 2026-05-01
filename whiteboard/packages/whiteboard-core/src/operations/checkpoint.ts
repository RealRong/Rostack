import type {
  MutationProgram
} from '@shared/mutation'

const CHECKPOINT_OPERATION_TYPES = new Set<string>([
  'document.create'
])

export const isCheckpointOperation = (
  operation: {
    type: string
  }
): boolean => CHECKPOINT_OPERATION_TYPES.has(operation.type)

export const isCheckpointProgram = (
  program: MutationProgram<string>
): boolean => (
  program.steps.length > 0
  && program.steps.every((step) => (
    step.type === 'entity.create'
    && step.entity.type === 'document'
    && step.entity.id === 'document'
  ))
)

import type {
  Operation
} from '@whiteboard/core/types'

const CHECKPOINT_OPERATION_TYPES = new Set<Operation['type']>([
  'document.create'
])

export const isCheckpointOperation = (
  operation: Pick<Operation, 'type'>
): boolean => CHECKPOINT_OPERATION_TYPES.has(operation.type)

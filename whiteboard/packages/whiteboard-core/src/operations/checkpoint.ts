const CHECKPOINT_OPERATION_TYPES = new Set<string>([
  'document.create'
])

export const isCheckpointOperation = (
  operation: {
    type: string
  }
): boolean => CHECKPOINT_OPERATION_TYPES.has(operation.type)

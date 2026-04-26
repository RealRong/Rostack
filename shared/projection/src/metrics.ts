export interface StageMetrics {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}

export interface StageMetricsInput extends StageMetrics {
  changedNodeCount?: number
}

export const createStageMetrics = (
  input: StageMetricsInput
): StageMetrics => {
  const outputCount = input.outputCount
  const changedNodeCount = input.changedNodeCount
  const reusedNodeCount = input.reusedNodeCount ?? (
    outputCount !== undefined && changedNodeCount !== undefined
      ? Math.max(0, outputCount - changedNodeCount)
      : undefined
  )
  const rebuiltNodeCount = input.rebuiltNodeCount ?? (
    outputCount !== undefined && reusedNodeCount !== undefined
      ? Math.max(0, outputCount - reusedNodeCount)
      : undefined
  )

  return {
    ...(input.inputCount === undefined ? {} : { inputCount: input.inputCount }),
    ...(outputCount === undefined ? {} : { outputCount }),
    ...(reusedNodeCount === undefined ? {} : { reusedNodeCount }),
    ...(rebuiltNodeCount === undefined ? {} : { rebuiltNodeCount }),
    ...(input.changedSectionCount === undefined
      ? {}
      : { changedSectionCount: input.changedSectionCount }),
    ...(input.changedRecordCount === undefined
      ? {}
      : { changedRecordCount: input.changedRecordCount })
  }
}

import type { ViewStageMetrics } from '@dataview/engine/contracts/performance'

export interface ActivePhaseMetrics extends ViewStageMetrics {
  deriveMs: number
  publishMs: number
}

export const createActiveStageMetrics = (input: {
  inputCount?: number
  outputCount?: number
  reusedNodeCount?: number
  rebuiltNodeCount?: number
  changedNodeCount?: number
  changedSectionCount?: number
  changedRecordCount?: number
}) => {
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

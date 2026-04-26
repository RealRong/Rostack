import { createStageMetrics } from '@shared/projector/phase'
import type { ActivePhaseMetrics } from '../contracts/projector'

export {
  createStageMetrics as createActiveStageMetrics
}

export const toActivePhaseMetrics = (input: {
  deriveMs: number
  publishMs: number
  stage?: Omit<ActivePhaseMetrics, 'deriveMs' | 'publishMs'>
}): ActivePhaseMetrics => ({
  deriveMs: input.deriveMs,
  publishMs: input.publishMs,
  ...(input.stage ?? {})
})

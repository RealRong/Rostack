import {
  now
} from '@dataview/engine/runtime/clock'
import type {
  DeriveAction
} from '@dataview/engine/contracts/internal'

export interface SnapshotStageResult<TState, TPublished> {
  action: DeriveAction
  state: TState
  published: TPublished
  deriveMs: number
  publishMs: number
}

export const runSnapshotStage = <TState, TPublished>(input: {
  action: DeriveAction
  previousState?: TState
  previousPublished?: TPublished
  derive: () => TState
  publish: (state: TState) => TPublished
  canReusePublished?: (input: {
    action: DeriveAction
    state: TState
    previousState?: TState
    previousPublished?: TPublished
  }) => boolean
}): SnapshotStageResult<TState, TPublished> => {
  const deriveStart = now()
  const state = input.derive()
  const deriveMs = now() - deriveStart
  const canReusePublished = input.canReusePublished
    ? input.canReusePublished({
        action: input.action,
        state,
        previousState: input.previousState,
        previousPublished: input.previousPublished
      })
    : (
        input.action === 'reuse'
        && state === input.previousState
        && input.previousPublished !== undefined
      )

  if (canReusePublished) {
    return {
      action: input.action,
      state,
      published: input.previousPublished!,
      deriveMs,
      publishMs: 0
    }
  }

  const publishStart = now()
  const published = input.publish(state)
  const publishMs = now() - publishStart

  return {
    action: input.action,
    state,
    published,
    deriveMs,
    publishMs
  }
}

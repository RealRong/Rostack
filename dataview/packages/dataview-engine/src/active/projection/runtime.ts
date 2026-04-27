import { createProjectionRuntime } from '@shared/projection'
import type {
  ActiveProjectionInput,
  ActiveProjectionResult,
  ActiveProjectionRuntime
} from './types'
import { createActiveProjectionTrace } from './trace'
import { activeProjectionSpec } from './spec'

export const createActiveProjectionRuntime = (): ActiveProjectionRuntime => {
  const runtime = createProjectionRuntime(activeProjectionSpec)

  return {
    update: (input: ActiveProjectionInput): ActiveProjectionResult => {
      const state = runtime.state()
      const previous = state.publish.snapshot
      state.publish.previous = previous
      const result = runtime.update(input)
      const capture = runtime.capture()

      return {
        snapshot: capture.snapshot,
        ...(capture.delta
          ? {
              delta: capture.delta
            }
          : {}),
        trace: createActiveProjectionTrace({
          previous,
          next: capture.snapshot,
          projectionTrace: result.trace
        })
      }
    }
  }
}

import { createProjectionRuntime } from '@shared/projection'
import type {
  ActiveProjector,
  ActiveProjectorInput,
  ActiveProjectorResult
} from '../contracts/projector'
import { createActiveProjectorTrace } from './trace'
import { activeProjectorSpec } from './spec'

export const createActiveProjector = (): ActiveProjector => {
  const runtime = createProjectionRuntime(activeProjectorSpec)

  return {
    update: (input: ActiveProjectorInput): ActiveProjectorResult => {
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
        trace: createActiveProjectorTrace({
          previous,
          next: capture.snapshot,
          projectorTrace: result.trace
        })
      }
    }
  }
}

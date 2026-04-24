import { createProjector } from '@shared/projector'
import type {
  ActiveProjector,
  ActiveProjectorInput,
  ActiveProjectorResult
} from '../contracts/projector'
import { createActiveProjectorTrace } from './trace'
import { activeProjectorSpec } from './spec'

export const createActiveProjector = (): ActiveProjector => {
  const projector = createProjector(activeProjectorSpec)
  let runId = 0

  return {
    update: (input: ActiveProjectorInput): ActiveProjectorResult => {
      runId += 1
      const previous = projector.snapshot()
      const result = projector.update({
        ...input,
        runId
      })

      return {
        snapshot: result.snapshot,
        ...(result.change
          ? {
              delta: result.change
            }
          : {}),
        trace: createActiveProjectorTrace({
          previous,
          next: result.snapshot,
          projectorTrace: result.trace
        })
      }
    }
  }
}

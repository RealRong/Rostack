import { createProjector } from '@shared/projector/phase'
import type {
  ActiveProjector,
  ActiveProjectorInput,
  ActiveProjectorResult
} from '../contracts/projector'
import { createActiveProjectorTrace } from './trace'
import { activeProjectorSpec } from './spec'

export const createActiveProjector = (): ActiveProjector => {
  const projector = createProjector(activeProjectorSpec)

  return {
    update: (input: ActiveProjectorInput): ActiveProjectorResult => {
      const previous = projector.snapshot()
      const result = projector.update(input)

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

import {
  createRuntime,
  type RuntimeSpec
} from '@shared/projection-runtime'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type { ViewState } from '@dataview/engine/contracts'
import type {
  ActivePhaseMetrics,
  ActivePhaseName,
  ActiveProjectionInput,
  ActiveProjectionResult,
  ActiveProjectionRunInput,
  ActiveProjectionRuntime,
  ActiveProjectionWorking
} from './contracts'
import { createActiveProjectionPhases } from './phases'
import { createActiveProjectionPlanner } from './planner'
import { createActiveProjectionPublisher } from './publisher'
import { createActiveProjectionTrace } from './trace'
import { createActiveProjectionWorking } from './working'

const createActiveProjectionSpec = (): RuntimeSpec<
  ActiveProjectionRunInput,
  ActiveProjectionWorking,
  ViewState | undefined,
  ActiveDelta | undefined,
  ActivePhaseName,
  never,
  undefined,
  ActivePhaseMetrics
> => ({
  createWorking: createActiveProjectionWorking,
  createSnapshot: () => undefined,
  planner: createActiveProjectionPlanner(),
  publisher: createActiveProjectionPublisher(),
  phases: createActiveProjectionPhases()
})

export const createActiveProjectionRuntime = (): ActiveProjectionRuntime => {
  const runtime = createRuntime(createActiveProjectionSpec())
  let runId = 0

  return {
    update: (input: ActiveProjectionInput): ActiveProjectionResult => {
      runId += 1
      const previous = runtime.snapshot()
      const result = runtime.update({
        ...input,
        runId
      })
      const trace = createActiveProjectionTrace({
        previous,
        next: result.snapshot,
        runtimeTrace: result.trace
      })

      return {
        snapshot: result.snapshot,
        ...(result.change
          ? {
              delta: result.change
            }
          : {}),
        trace
      }
    }
  }
}

import type { RuntimePublisher } from '@shared/projection-runtime'
import type {
  ActiveProjectionWorking
} from './contracts'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type { ViewState } from '@dataview/engine/contracts'

export const createActiveProjectionPublisher = (): RuntimePublisher<
  ActiveProjectionWorking,
  ViewState | undefined,
  ActiveDelta | undefined
> => ({
  publish: ({ previous, working }) => ({
    snapshot: working.publish.snapshot,
    change: working.publish.snapshot === previous
      ? undefined
      : working.publish.delta
  })
})

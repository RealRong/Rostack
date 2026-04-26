import type { ProjectorPublisher } from '@shared/projector/phase'
import type {
  ActiveProjectorWorking
} from '../contracts/projector'
import type { ActiveDelta } from '@dataview/engine/contracts/delta'
import type { ViewState } from '@dataview/engine/contracts/view'

export const activeProjectorPublisher: ProjectorPublisher<
  ActiveProjectorWorking,
  ViewState | undefined,
  ActiveDelta | undefined
> = {
  publish: ({ previous, working }) => ({
    snapshot: working.publish.snapshot,
    change: working.publish.snapshot === previous
      ? undefined
      : working.publish.delta
  })
}

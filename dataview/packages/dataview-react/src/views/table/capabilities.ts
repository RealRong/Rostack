import { store } from '@shared/core'
import type { InteractionState } from '@dataview/react/interaction'
import type {
  TableViewState
} from '@dataview/runtime'

export interface Capabilities {
  canHover: boolean
  canRowDrag: boolean
  canColumnResize: boolean
  showFillHandle: boolean
}

const equalCapabilities = (
  left: Capabilities,
  right: Capabilities
) => (
  left.canHover === right.canHover
  && left.canRowDrag === right.canRowDrag
  && left.canColumnResize === right.canColumnResize
  && left.showFillHandle === right.showFillHandle
)

export const createCapabilities = (options: {
  view: store.ReadStore<TableViewState | undefined>
  locked: store.ReadStore<boolean>
  interaction: store.ReadStore<InteractionState>
}): store.ReadStore<Capabilities> => store.createDerivedStore<Capabilities>({
  get: () => {
    const locked = store.read(options.locked)
    const interaction = store.read(options.interaction)
    const view = store.read(options.view)
    const canHover = !locked && (
      interaction.mode === 'idle'
      || interaction.mode === 'keyboard'
    )
    const showFillHandle = !locked && (
      interaction.mode === 'idle'
      || interaction.mode === 'keyboard'
      || interaction.gesture === 'cell-select'
    )

    return {
      canHover,
      canRowDrag: !locked && Boolean(
        view
        && view.query.sort.rules.length === 0
        && !view.query.group
      ),
      canColumnResize: !locked,
      showFillHandle
    }
  },
  isEqual: equalCapabilities
})

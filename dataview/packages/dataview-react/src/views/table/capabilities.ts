import { store } from '@shared/core'
import type { InteractionState } from '@dataview/react/interaction'
import type {
  TableBody
} from '@dataview/runtime'
import type {
  ActiveViewQuery
} from '@dataview/engine'

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
  body: store.ReadStore<TableBody | null>
  query: store.ReadStore<ActiveViewQuery>
  locked: store.ReadStore<boolean>
  interaction: store.ReadStore<InteractionState>
}): store.ReadStore<Capabilities> => store.createDerivedStore<Capabilities>({
  get: () => {
    const locked = store.read(options.locked)
    const interaction = store.read(options.interaction)
    const body = store.read(options.body)
    const query = store.read(options.query)
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
        body
        && query.sort.rules.length === 0
        && !query.group
      ),
      canColumnResize: !locked,
      showFillHandle
    }
  },
  isEqual: equalCapabilities
})

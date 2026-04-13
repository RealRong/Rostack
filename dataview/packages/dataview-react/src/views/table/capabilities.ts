import type { ViewState as CurrentView } from '@dataview/engine'
import { createDerivedStore, read, type ReadStore } from '@shared/core'
import type { InteractionState } from '#react/interaction/index.ts'

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
  currentView: ReadStore<CurrentView | undefined>
  locked: ReadStore<boolean>
  interaction: ReadStore<InteractionState>
}): ReadStore<Capabilities> => createDerivedStore<Capabilities>({
  get: () => {
    const locked = read(options.locked)
    const interaction = read(options.interaction)
    const currentView = read(options.currentView)
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
        currentView
        && !currentView.view.sort.length
        && !currentView.view.group
      ),
      canColumnResize: !locked,
      showFillHandle
    }
  },
  isEqual: equalCapabilities
})

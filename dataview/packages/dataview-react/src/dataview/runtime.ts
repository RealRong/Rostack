import type {
  View
} from '@dataview/core/contracts'
import type {
  Engine
} from '@dataview/engine'
import type {
  ReadStore
} from '@shared/core'
import {
  joinUnsubscribes
} from '@shared/core'
import {
  createDataViewRuntime,
  type PageSessionInput
} from '@dataview/runtime'
import {
  createDragApi
} from '@dataview/react/page/drag'
import {
  createMarqueeApi,
  type MarqueeApi
} from '@dataview/react/runtime/marquee'
import type {
  DataViewSession
} from '@dataview/react/dataview/types'

const bindMarqueeToView = (input: {
  activeView: ReadStore<View | undefined>
  marquee: MarqueeApi
}) => {
  const sync = () => {
    const session = input.marquee.get()
    if (!session) {
      return
    }

    const view = input.activeView.get()
    if (!view || view.id !== session.ownerViewId) {
      input.marquee.clear()
    }
  }

  sync()
  return input.activeView.subscribe(sync)
}

export const createDataViewSession = (input: {
  engine: Engine
  initialPage?: PageSessionInput
}): DataViewSession => {
  const runtime = createDataViewRuntime(input)
  const drag = createDragApi()
  const marquee = createMarqueeApi()

  const disposeBindings = joinUnsubscribes([
    bindMarqueeToView({
      activeView: runtime.read.activeView,
      marquee
    })
  ])

  return {
    ...runtime,
    page: {
      ...runtime.page,
      drag
    },
    marquee,
    session: {
      ...runtime.session,
      select: {
        ...runtime.session.select,
        canStartMarquee: () => (
          runtime.session.select.canStartMarquee()
          && marquee.get() === null
        )
      }
    },
    dispose: () => {
      drag.clear()
      marquee.clear()
      disposeBindings()
      runtime.dispose()
    }
  }
}

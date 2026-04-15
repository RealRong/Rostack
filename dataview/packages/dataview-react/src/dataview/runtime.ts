import type { Engine } from '@dataview/engine'
import type {
  ReadStore
} from '@shared/core'
import {
  joinUnsubscribes
} from '@shared/core'
import {
  createPageSessionApi
} from '@dataview/react/page/session/api'
import type {
  PageSessionInput
} from '@dataview/react/page/session/types'
import {
  createPageStateStore
} from '@dataview/react/page/state'
import {
  createItemSelectionDomainSource,
  createSelectionController,
  selectionSnapshot,
  type ItemSelectionController
} from '@dataview/react/runtime/selection'
import {
  createInlineSessionApi,
  type InlineSessionApi
} from '@dataview/react/runtime/inlineSession'
import {
  createValueEditorApi,
} from '@dataview/react/runtime/valueEditor'
import {
  createMarqueeApi,
  type MarqueeApi
} from '@dataview/react/runtime/marquee'
import type {
  ItemList
} from '@dataview/engine'
import type {
  View
} from '@dataview/core/contracts'
import type {
  DataViewSession
} from '@dataview/react/dataview/types'

const bindInlineSessionToView = (input: {
  activeView: ReadStore<View | undefined>
  items: ReadStore<ItemList | undefined>
  inlineSession: InlineSessionApi
}) => {
  const sync = () => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    const view = input.activeView.get()
    const items = input.items.get()
    if (!view || !items) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
      return
    }

    if (view.id !== session.viewId || !items.has(session.itemId)) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
    }
  }

  sync()
  return joinUnsubscribes([
    input.activeView.subscribe(sync),
    input.items.subscribe(sync)
  ])
}

const bindInlineSessionToSelection = (input: {
  selection: ItemSelectionController
  inlineSession: InlineSessionApi
}) => joinUnsubscribes([
  input.inlineSession.store.subscribe(() => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    if (input.selection.query.count() > 0) {
      input.selection.command.clear()
    }
  }),
  input.selection.state.store.subscribe(() => {
    if (!input.selection.query.count()) {
      return
    }

    if (input.inlineSession.store.get()) {
      input.inlineSession.exit({
        reason: 'selection'
      })
    }
  })
])

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
  const page = createPageSessionApi(input.initialPage)
  const marquee = createMarqueeApi()
  const inlineSession = createInlineSessionApi()
  const valueEditor = createValueEditorApi()
  const activeAppearances = input.engine.active.select(
    state => state?.items
  )
  const selectionRuntime = createSelectionController({
    domainSource: createItemSelectionDomainSource({
      store: activeAppearances
    })
  })
  const selection = selectionRuntime.controller
  const pageStateStore = createPageStateStore({
    document: input.engine.select.document,
    activeViewId: input.engine.active.id,
    activeView: input.engine.active.config,
    page: page.store,
    valueEditorOpen: valueEditor.openStore
  })

  const disposeBindings = joinUnsubscribes([
    bindMarqueeToView({
      activeView: input.engine.active.config,
      marquee
    }),
    bindInlineSessionToSelection({
      selection,
      inlineSession
    }),
    bindInlineSessionToView({
      activeView: input.engine.active.config,
      items: activeAppearances,
      inlineSession
    })
  ])

  return {
    engine: input.engine,
    page: {
      ...page,
      store: pageStateStore
    },
    selection,
    marquee,
    inlineSession,
    valueEditor,
    dispose: () => {
      disposeBindings()
      selectionRuntime.dispose()
      page.dispose()
    }
  }
}

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
  createSelectionApi,
  createSelectionStore,
  emptySelection,
  selection as selectionHelpers,
  syncSelection,
  type SelectionApi
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
} from './types'

const bindSelectionToAppearances = (input: {
  items: ReadStore<ItemList | undefined>
  selection: SelectionApi
}) => {
  const sync = () => {
    const items = input.items.get()
    if (!items) {
      if (!selectionHelpers.equal(input.selection.get(), emptySelection)) {
        input.selection.store.set(emptySelection)
      }
      return
    }

    syncSelection(input.selection.store, items.ids)
  }

  sync()
  return input.items.subscribe(sync)
}

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
  selection: SelectionApi
  inlineSession: InlineSessionApi
}) => joinUnsubscribes([
  input.inlineSession.store.subscribe(() => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    if (!selectionHelpers.equal(input.selection.get(), emptySelection)) {
      input.selection.store.set(emptySelection)
    }
  }),
  input.selection.store.subscribe(() => {
    const selection = input.selection.store.get()
    if (!selection.ids.length) {
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
  const selectionStore = createSelectionStore()
  const marquee = createMarqueeApi()
  const inlineSession = createInlineSessionApi()
  const valueEditor = createValueEditorApi()
  const activeAppearances = input.engine.active.select(
    state => state?.items
  )
  const selection = createSelectionApi({
    store: selectionStore,
    scope: {
      items: () => activeAppearances.get()
    }
  })
  const pageStateStore = createPageStateStore({
    document: input.engine.select.document,
    activeViewId: input.engine.active.id,
    activeView: input.engine.active.config,
    page: page.store,
    valueEditorOpen: valueEditor.openStore
  })

  const disposeBindings = joinUnsubscribes([
    bindSelectionToAppearances({
      items: activeAppearances,
      selection
    }),
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
      page.dispose()
    }
  }
}

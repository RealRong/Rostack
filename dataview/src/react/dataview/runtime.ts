import type { Engine } from '@dataview/engine'
import type {
  ReadStore
} from '@dataview/runtime/store'
import {
  joinUnsubscribes
} from '@dataview/runtime/store'
import {
  createCurrentViewStore
} from '@dataview/react/runtime/currentView'
import type {
  CurrentView
} from '@dataview/react/runtime/currentView'
import {
  createPageSessionApi
} from '@dataview/react/page/session/api'
import type {
  PageSessionApi,
  PageSessionInput,
  ResolvedPageState
} from '@dataview/react/page/session/types'
import {
  createResolvedPageStateStore
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
  type ValueEditorController
} from '@dataview/react/runtime/valueEditor'
import {
  createMarqueeApi,
  type MarqueeApi
} from '@dataview/react/runtime/marquee'

export interface DataViewContextValue {
  engine: Engine
  currentView: ReadStore<CurrentView | undefined>
  page: PageSessionApi & {
    store: ReadStore<ResolvedPageState>
  }
  selection: SelectionApi
  marquee: MarqueeApi
  inlineSession: InlineSessionApi
  valueEditor: ValueEditorController
}

export interface DataViewRuntime extends DataViewContextValue {
  dispose(): void
}

const bindSelectionToCurrentView = (input: {
  currentView: ReadStore<CurrentView | undefined>
  selection: SelectionApi
}) => {
  const sync = () => {
    const view = input.currentView.get()
    if (!view) {
      if (!selectionHelpers.equal(input.selection.get(), emptySelection)) {
        input.selection.store.set(emptySelection)
      }
      return
    }

    syncSelection(input.selection.store, view.appearances.ids)
  }

  sync()
  return input.currentView.subscribe(sync)
}

const bindInlineSessionToCurrentView = (input: {
  currentView: ReadStore<CurrentView | undefined>
  inlineSession: InlineSessionApi
}) => {
  const sync = () => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    const view = input.currentView.get()
    if (!view) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
      return
    }

    if (view.view.id !== session.viewId || !view.appearances.has(session.appearanceId)) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
    }
  }

  sync()
  return input.currentView.subscribe(sync)
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

const bindMarqueeToCurrentView = (input: {
  currentView: ReadStore<CurrentView | undefined>
  marquee: MarqueeApi
}) => {
  const sync = () => {
    const session = input.marquee.get()
    if (!session) {
      return
    }

    const view = input.currentView.get()
    if (!view || view.view.id !== session.ownerViewId) {
      input.marquee.clear()
    }
  }

  sync()
  return input.currentView.subscribe(sync)
}

export const createDataViewRuntime = (input: {
  engine: Engine
  initialPage?: PageSessionInput
}): DataViewRuntime => {
  const page = createPageSessionApi(input.initialPage)
  const selectionStore = createSelectionStore()
  const marquee = createMarqueeApi()
  const inlineSession = createInlineSessionApi()
  const valueEditor = createValueEditorApi()
  const currentView = createCurrentViewStore({
    engine: input.engine,
    pageStore: page.store,
    selection: selectionStore
  })
  const selection = createSelectionApi({
    store: selectionStore,
    scope: {
      currentView: () => currentView.get()
    }
  })
  const pageStateStore = createResolvedPageStateStore({
    document: input.engine.read.document,
    page: page.store,
    valueEditorOpen: valueEditor.openStore
  })

  const disposeBindings = joinUnsubscribes([
    bindSelectionToCurrentView({
      currentView,
      selection
    }),
    bindMarqueeToCurrentView({
      currentView,
      marquee
    }),
    bindInlineSessionToSelection({
      selection,
      inlineSession
    }),
    bindInlineSessionToCurrentView({
      currentView,
      inlineSession
    })
  ])

  return {
    engine: input.engine,
    currentView,
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

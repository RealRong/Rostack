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
  PageState,
  PageSessionApi,
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
  type ValueEditorController
} from '@dataview/react/runtime/valueEditor'
import {
  createMarqueeApi,
  type MarqueeApi
} from '@dataview/react/runtime/marquee'
import type {
  AppearanceList
} from '@dataview/engine/project'
import type {
  View
} from '@dataview/core/contracts'

export interface DataViewContextValue {
  engine: Engine
  page: PageSessionApi & {
    store: ReadStore<PageState>
  }
  selection: SelectionApi
  marquee: MarqueeApi
  inlineSession: InlineSessionApi
  valueEditor: ValueEditorController
}

export interface DataViewSession extends DataViewContextValue {
  dispose(): void
}

const bindSelectionToAppearances = (input: {
  appearances: ReadStore<AppearanceList | undefined>
  selection: SelectionApi
}) => {
  const sync = () => {
    const appearances = input.appearances.get()
    if (!appearances) {
      if (!selectionHelpers.equal(input.selection.get(), emptySelection)) {
        input.selection.store.set(emptySelection)
      }
      return
    }

    syncSelection(input.selection.store, appearances.ids)
  }

  sync()
  return input.appearances.subscribe(sync)
}

const bindInlineSessionToView = (input: {
  activeView: ReadStore<View | undefined>
  appearances: ReadStore<AppearanceList | undefined>
  inlineSession: InlineSessionApi
}) => {
  const sync = () => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    const view = input.activeView.get()
    const appearances = input.appearances.get()
    if (!view || !appearances) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
      return
    }

    if (view.id !== session.viewId || !appearances.has(session.appearanceId)) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
    }
  }

  sync()
  return joinUnsubscribes([
    input.activeView.subscribe(sync),
    input.appearances.subscribe(sync)
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
    state => state?.appearances
  )
  const selection = createSelectionApi({
    store: selectionStore,
    scope: {
      appearances: () => activeAppearances.get()
    }
  })
  const pageStateStore = createPageStateStore({
    document: input.engine.read.document,
    activeViewId: input.engine.active.id,
    activeView: input.engine.active.view,
    page: page.store,
    valueEditorOpen: valueEditor.openStore
  })

  const disposeBindings = joinUnsubscribes([
    bindSelectionToAppearances({
      appearances: activeAppearances,
      selection
    }),
    bindMarqueeToView({
      activeView: input.engine.active.view,
      marquee
    }),
    bindInlineSessionToSelection({
      selection,
      inlineSession
    }),
    bindInlineSessionToView({
      activeView: input.engine.active.view,
      appearances: activeAppearances,
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

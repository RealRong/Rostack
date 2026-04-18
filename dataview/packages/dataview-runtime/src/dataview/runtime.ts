import {
  createDerivedStore,
  joinUnsubscribes,
  read,
  type ReadStore
} from '@shared/core'
import type {
  View
} from '@dataview/core/contracts'
import type {
  ItemList
} from '@dataview/engine'
import {
  createCreateRecordApi
} from '@dataview/runtime/createRecord'
import {
  createInlineSessionApi,
  type InlineSessionApi
} from '@dataview/runtime/inlineSession'
import {
  createPageSessionApi
} from '@dataview/runtime/page/session/api'
import {
  createPageStateStore
} from '@dataview/runtime/page/state'
import {
  createItemSelectionDomainSource,
  createSelectionController,
  type ItemSelectionController
} from '@dataview/runtime/selection'
import type {
  CreateDataViewRuntimeInput,
  DataViewRuntime,
  DataViewSessionState
} from '@dataview/runtime/dataview/types'
import {
  createValueEditorApi
} from '@dataview/runtime/valueEditor'

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

export const createDataViewRuntime = (
  input: CreateDataViewRuntimeInput
): DataViewRuntime => {
  const page = createPageSessionApi(input.initialPage)
  const inlineSession = createInlineSessionApi()
  const createRecord = createCreateRecordApi({
    activeView: input.engine.active.config
  })
  const valueEditor = createValueEditorApi()
  const activeItems = input.engine.active.select(
    state => state?.items
  )
  const selectionRuntime = createSelectionController({
    domainSource: createItemSelectionDomainSource({
      store: activeItems
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
  const sessionStore = createDerivedStore<DataViewSessionState>({
    get: () => ({
      page: read(pageStateStore),
      editing: {
        inline: read(inlineSession.store),
        valueEditor: read(valueEditor.store)
      },
      selection: read(selection.state.store)
    })
  })

  const disposeBindings = joinUnsubscribes([
    bindInlineSessionToSelection({
      selection,
      inlineSession
    }),
    bindInlineSessionToView({
      activeView: input.engine.active.config,
      items: activeItems,
      inlineSession
    })
  ])

  return {
    engine: input.engine,
    read: {
      engine: input.engine,
      document: input.engine.select.document,
      activeViewId: input.engine.active.id,
      activeView: input.engine.active.config,
      activeItems,
      activeViewState: input.engine.active.state
    },
    write: {
      engine: input.engine,
      active: input.engine.active,
      records: input.engine.records,
      views: input.engine.views
    },
    session: {
      store: sessionStore,
      page: {
        ...page,
        store: pageStateStore
      },
      selection,
      editing: {
        inline: inlineSession,
        valueEditor
      },
      creation: createRecord,
      select: {
        isValueEditorOpen: () => pageStateStore.get().valueEditorOpen,
        pageLock: () => pageStateStore.get().lock,
        activeInlineTarget: () => inlineSession.store.get(),
        canStartMarquee: () => (
          !pageStateStore.get().valueEditorOpen
          && inlineSession.store.get() === null
        )
      }
    },
    intent: {
      page,
      selection: selection.command,
      editing: {
        inline: inlineSession,
        valueEditor
      },
      createRecord
    },
    page: {
      ...page,
      store: pageStateStore
    },
    selection,
    inlineSession,
    createRecord,
    valueEditor,
    dispose: () => {
      createRecord.cancel()
      disposeBindings()
      selectionRuntime.dispose()
      page.dispose()
    }
  }
}

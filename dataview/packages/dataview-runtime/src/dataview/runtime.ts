import {
  createDerivedStore,
  joinUnsubscribes,
  read,
  sameIdOrder
} from '@shared/core'
import type {
  CustomField,
  View
} from '@dataview/core/contracts'
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
  createGalleryModel,
  createKanbanModel,
  createPageModel,
  createTableModel
} from '@dataview/runtime/model'
import {
  createMarqueeController
} from '@dataview/runtime/marquee'
import {
  createItemArraySelectionDomain,
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

const createFieldsStore = (
  source: CreateDataViewRuntimeInput['engine']['source']['doc']['fields']
) => createDerivedStore<readonly CustomField[]>({
  get: () => read(source.ids)
    .flatMap(fieldId => {
      const field = read(source, fieldId)
      return field ? [field] : []
    }),
  isEqual: sameIdOrder
})

const bindInlineSessionToView = (input: {
  activeView: ReturnType<typeof createDerivedStore<View | undefined>>
  items: CreateDataViewRuntimeInput['engine']['source']['active']['items']
  inlineSession: InlineSessionApi
}) => {
  const sync = () => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    const view = input.activeView.get()
    const item = input.items.get(session.itemId)
    if (!view || !item || view.id !== session.viewId) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
    }
  }

  sync()
  return joinUnsubscribes([
    input.activeView.subscribe(sync),
    input.items.ids.subscribe(sync)
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
  activeView: ReturnType<typeof createDerivedStore<View | undefined>>
  marquee: Pick<ReturnType<typeof createMarqueeController>, 'get' | 'clear'>
}) => {
  let previousViewId = input.activeView.get()?.id

  const sync = () => {
    const nextViewId = input.activeView.get()?.id
    if (previousViewId !== nextViewId && input.marquee.get()) {
      input.marquee.clear()
    }

    previousViewId = nextViewId
  }

  sync()
  return input.activeView.subscribe(sync)
}

export const createDataViewRuntime = (
  input: CreateDataViewRuntimeInput
): DataViewRuntime => {
  const page = createPageSessionApi(input.initialPage)
  const inlineSession = createInlineSessionApi()
  const createRecord = createCreateRecordApi({
    activeView: input.engine.active.config
  })
  const valueEditor = createValueEditorApi()
  const activeItemIds = input.engine.source.active.items.ids
  const activeView = input.engine.source.active.view.current
  const selectionRuntime = createSelectionController({
    domainSource: {
      get: () => createItemArraySelectionDomain(read(activeItemIds)),
      subscribe: activeItemIds.subscribe
    }
  })
  const selection = selectionRuntime.controller
  const marquee = createMarqueeController({
    selection,
    resolveDomain: () => createItemArraySelectionDomain(read(activeItemIds))
  })
  const fieldsStore = createFieldsStore(input.engine.source.doc.fields)
  const pageStateStore = createPageStateStore({
    fields: fieldsStore,
    activeViewId: input.engine.source.active.view.id,
    activeView,
    page: page.store,
    valueEditorOpen: valueEditor.openStore
  })
  const source = {
    doc: input.engine.source.doc,
    active: input.engine.source.active,
    page: {
      queryVisible: createDerivedStore({
        get: () => read(pageStateStore).query.visible,
        isEqual: Object.is
      }),
      queryRoute: createDerivedStore({
        get: () => read(pageStateStore).query.route
      })
    },
    selection: {
      member: selection.store.membership,
      preview: marquee.preview.membership
    },
    inline: {
      editing: inlineSession.editing
    }
  }
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
  const model = {
    page: createPageModel({
      source,
      pageStateStore
    }),
    table: createTableModel({
      source
    }),
    gallery: createGalleryModel({
      source,
      inlineKey: inlineSession.key
    }),
    kanban: createKanbanModel({
      source,
      inlineKey: inlineSession.key
    })
  }

  const disposeBindings = joinUnsubscribes([
    bindInlineSessionToSelection({
      selection,
      inlineSession
    }),
    bindMarqueeToView({
      activeView,
      marquee
    }),
    bindInlineSessionToView({
      activeView,
      items: input.engine.source.active.items,
      inlineSession
    })
  ])

  return {
    engine: input.engine,
    source,
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
      marquee
    },
    intent: {
      page,
      selection: selection.command,
      editing: {
        inline: inlineSession,
        valueEditor
      },
      createRecord,
      marquee
    },
    model,
    dispose: () => {
      selectionRuntime.dispose()
      disposeBindings()
    }
  }
}

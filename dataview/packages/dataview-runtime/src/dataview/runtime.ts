import { store } from '@shared/core'
import type {
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
  createPageModel
} from '@dataview/runtime/model'
import {
  createPresentListStore
} from '@dataview/runtime/model/internal/list'
import {
  createMarqueeController
} from '@dataview/runtime/marquee'
import {
  createEngineSource
} from '@dataview/runtime/source'
import {
  createTableRuntime
} from '@dataview/runtime/table'
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

const bindInlineSessionToView = (input: {
  activeView: store.ReadStore<View | undefined>
  items: {
    ids: store.ReadStore<readonly number[]>
    read: {
      placement: store.KeyedReadStore<number, {
        recordId: string
        sectionKey: string
      } | undefined>
    }
  }
  inlineSession: InlineSessionApi
}) => {
  const sync = () => {
    const session = input.inlineSession.store.get()
    if (!session) {
      return
    }

    const view = input.activeView.get()
    const placement = input.items.read.placement.get(session.itemId)
    if (!view || !placement || view.id !== session.viewId) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
    }
  }

  sync()
  return store.joinUnsubscribes([
    input.activeView.subscribe(sync),
    input.items.ids.subscribe(sync)
  ])
}

const bindInlineSessionToSelection = (input: {
  selection: ItemSelectionController
  inlineSession: InlineSessionApi
}) => store.joinUnsubscribes([
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
  activeView: store.ReadStore<View | undefined>
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
  const sourceRuntime = createEngineSource({
    core: input.engine.core
  })
  const page = createPageSessionApi(input.initialPage)
  const inlineSession = createInlineSessionApi()
  const createRecord = createCreateRecordApi({
    activeView: sourceRuntime.source.active.view.current
  })
  const table = createTableRuntime(sourceRuntime.source.active)
  const valueEditor = createValueEditorApi()
  const activeItemIds = sourceRuntime.source.active.items.ids
  const activeView = sourceRuntime.source.active.view.current
  const activeSelectionDomain = store.createDerivedStore({
    get: () => createItemArraySelectionDomain(store.read(activeItemIds))
  })
  const selectionRuntime = createSelectionController({
    domainSource: {
      get: () => store.read(activeSelectionDomain),
      subscribe: activeSelectionDomain.subscribe
    }
  })
  const selection = selectionRuntime.controller
  const marquee = createMarqueeController({
    selection,
    resolveDomain: () => store.read(activeSelectionDomain)
  })
  const fieldsStore = createPresentListStore({
    ids: sourceRuntime.source.doc.fields.ids,
    values: sourceRuntime.source.doc.fields
  })
  const pageStateStore = createPageStateStore({
    fields: fieldsStore,
    activeViewId: sourceRuntime.source.active.view.id,
    activeView,
    page: page.store,
    valueEditorOpen: valueEditor.openStore
  })
  const source = {
    doc: sourceRuntime.source.doc,
    active: sourceRuntime.source.active,
    selection: {
      member: selection.store.membership,
      preview: marquee.preview.membership
    },
    inline: {
      editing: inlineSession.editing
    }
  }
  const sessionStore = store.createDerivedStore<DataViewSessionState>({
    get: () => ({
      page: store.read(pageStateStore),
      editing: {
        inline: store.read(inlineSession.store),
        valueEditor: store.read(valueEditor.store)
      },
      selection: store.read(selection.state.store)
    })
  })
  const model = {
    page: createPageModel({
      source,
      pageStateStore
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

  const disposeBindings = store.joinUnsubscribes([
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
      items: sourceRuntime.source.active.items,
      inlineSession
    })
  ])

  return {
    engine: input.engine,
    source,
    table,
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
      sourceRuntime.dispose()
    }
  }
}

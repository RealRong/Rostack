import { store } from '@shared/core'
import type {
  View
} from '@dataview/core/contracts'
import {
  createRecordWorkflow
} from '@dataview/runtime/workflow/createRecord'
import {
  createInlineSessionApi,
  type InlineSessionApi
} from '@dataview/runtime/session/inline'
import {
  createPageSessionController
} from '@dataview/runtime/session/page'
import {
  createGalleryModel,
  createKanbanModel,
  createPageModel
} from '@dataview/runtime/model'
import {
  createMarqueeController
} from '@dataview/runtime/session/marquee'
import {
  createEngineSource
} from '@dataview/runtime/source'
import {
  createTableModel
} from '@dataview/runtime/model/table'
import {
  createItemListSelectionDomain,
  createItemSelectionDomainSource,
  createSelectionController,
  type ItemSelectionController
} from '@dataview/runtime/selection'
import type {
  CreateDataViewRuntimeInput,
  DataViewRuntime
} from '@dataview/runtime/contracts'
import {
  createValueEditorApi
} from '@dataview/runtime/session/valueEditor'
const bindInlineSessionToView = (input: {
  view: store.ReadStore<View | undefined>
  items: {
    ids: store.ReadStore<readonly number[]>
    read: {
      placement: store.KeyedReadStore<number, {
        recordId: string
        sectionId: string
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

    const view = input.view.get()
    const placement = input.items.read.placement.get(session.itemId)
    if (!view || !placement || view.id !== session.viewId) {
      input.inlineSession.exit({
        reason: 'view-change'
      })
    }
  }

  sync()
  return store.joinUnsubscribes([
    input.view.subscribe(sync),
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
  view: store.ReadStore<View | undefined>
  marquee: Pick<ReturnType<typeof createMarqueeController>, 'get' | 'clear'>
}) => {
  let previousViewId = input.view.get()?.id

  const sync = () => {
    const nextViewId = input.view.get()?.id
    if (previousViewId !== nextViewId && input.marquee.get()) {
      input.marquee.clear()
    }

    previousViewId = nextViewId
  }

  sync()
  return input.view.subscribe(sync)
}

export const createDataViewRuntime = (
  input: CreateDataViewRuntimeInput
): DataViewRuntime => {
  const sourceRuntime = createEngineSource({
    engine: input.engine
  })
  const page = createPageSessionController(input.page)
  const inline = createInlineSessionApi()
  const createRecord = createRecordWorkflow({
    view: sourceRuntime.source.active.view
  })
  const table = createTableModel(sourceRuntime.source)
  const valueEditor = createValueEditorApi()
  const activeItems = sourceRuntime.source.active.items.list
  const view = sourceRuntime.source.active.view
  const activeSelectionDomain = createItemSelectionDomainSource({
    store: activeItems
  })
  const selectionRuntime = createSelectionController({
    domainSource: activeSelectionDomain
  })
  const selection = selectionRuntime.controller
  const marquee = createMarqueeController({
    selection,
    resolveDomain: () => createItemListSelectionDomain(store.read(activeItems))
  })
  const model = {
    page: createPageModel({
      source: sourceRuntime.source,
      pageSessionStore: page.store,
      valueEditorOpenStore: valueEditor.openStore
    }),
    table,
    gallery: createGalleryModel({
      source: sourceRuntime.source,
      selectionMembershipStore: selection.store.membership,
      previewSelectionMembershipStore: marquee.preview.membership,
      inlineEditingStore: inline.editing,
      inlineKey: inline.key
    }),
    kanban: createKanbanModel({
      source: sourceRuntime.source,
      selectionMembershipStore: selection.store.membership,
      previewSelectionMembershipStore: marquee.preview.membership,
      inlineEditingStore: inline.editing,
      inlineKey: inline.key
    })
  }

  const disposeBindings = store.joinUnsubscribes([
    bindInlineSessionToSelection({
      selection,
      inlineSession: inline
    }),
    bindMarqueeToView({
      view,
      marquee
    }),
    bindInlineSessionToView({
      view,
      items: sourceRuntime.source.active.items,
      inlineSession: inline
    })
  ])

  return {
    engine: input.engine,
    history: input.engine.history,
    source: sourceRuntime.source,
    session: {
      page,
      selection,
      inline,
      valueEditor,
      marquee
    },
    workflow: {
      createRecord,
    },
    model,
    dispose: () => {
      selectionRuntime.dispose()
      disposeBindings()
      sourceRuntime.dispose()
    }
  }
}

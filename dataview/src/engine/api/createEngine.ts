import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  cloneDocument
} from '@dataview/core/document'
import type {
  CreateEngineOptions,
  Engine
} from '../types'
import {
  createPerfRuntime
} from '../perf/runtime'
import {
  createFieldsEngineApi,
  createRecordsEngineApi,
  createViewEngineApi,
  createViewsEngineApi
} from '../services'
import {
  createInitialState
} from '../state'
import {
  createProjectApi,
  createReadApi
} from '../state/select'
import {
  translateCommands
} from '../write/translate'
import {
  createStore
} from '../state'
import {
  createWriteControl
} from '../write/commit'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneDocument(options.document)
  const perf = createPerfRuntime(options.perf)
  const capturePerf = Boolean(options.perf?.trace || options.perf?.stats)
  const store = createStore(createInitialState({
    doc: initialDocument,
    historyCap: historyCapacity,
    capturePerf
  }))
  const read = createReadApi(store)
  const project = createProjectApi(store)
  const write = createWriteControl({
    store,
    perf,
    capturePerf
  })

  const engine = {
    read: {
      document: read.document,
      activeViewId: read.activeViewId,
      activeView: read.activeView,
      recordIds: read.recordIds,
      record: read.record,
      customFieldIds: read.customFieldIds,
      customFields: read.customFields,
      customField: read.customField,
      viewIds: read.viewIds,
      views: read.views,
      view: read.view
    },
    project,
    perf: perf.api,
    command: (command: Parameters<Engine['command']>[0]) => write.run(
      translateCommands(store.get().doc, command)
    ),
    history: {
      state: write.history.state,
      canUndo: write.history.canUndo,
      canRedo: write.history.canRedo,
      undo: write.undo,
      redo: write.redo,
      clear: write.history.clear
    },
    document: {
      export: () => cloneDocument(store.get().doc),
      replace: (document: DataDoc) => {
        write.load(cloneDocument(document))
        return cloneDocument(store.get().doc)
      }
    }
  } as unknown as Engine

  engine.views = createViewsEngineApi({
    engine
  })
  engine.fields = createFieldsEngineApi({
    engine
  })
  engine.records = createRecordsEngineApi({
    engine
  })
  engine.view = Object.assign(
    (viewId: string) => createViewEngineApi({
      engine,
      viewId
    }),
    {
      open: (viewId: string) => {
        engine.command({
          type: 'view.open',
          viewId
        })
      }
    }
  )

  return engine
}

export type {
  CreateEngineOptions,
  Engine
} from '../types'

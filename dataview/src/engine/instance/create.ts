import type { CreateEngineOptions, Engine } from '../types'
import type { DataDoc } from '@dataview/core/contracts'
import { cloneDocument } from '@dataview/core/document'
import { resolveWriteBatch } from '@dataview/engine/command'
import { createProjectSource } from '../project/source'
import { read as createRead } from '../runtime/read/read'
import { commitRuntime } from '../runtime/commit/runtime'
import { document } from './document'
import {
  createPerfRuntime
} from '../perf/runtime'
import {
  createFieldsEngineApi,
  createRecordsEngineApi,
  createViewEngineApi,
  createViewsEngineApi
} from '../services'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneDocument(options.document)
  const perf = createPerfRuntime(options.perf)

  const instanceDocument = document({
    initialDocument
  })

  const read = createRead({
    getDocument: instanceDocument.peekDocument
  })
  const project = createProjectSource({
    document: instanceDocument.peekDocument(),
    perf: options.perf
  })

  const commit = commitRuntime({
    document: instanceDocument,
    read,
    project,
    historyCapacity,
    perf
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
    command: (command: Parameters<Engine['command']>[0]) => {
      const batch = resolveWriteBatch({
        document: instanceDocument.peekDocument(),
        commands: Array.isArray(command) ? command : [command]
      })
      return commit.dispatch(batch)
    },
    history: {
      state: commit.history.state,
      canUndo: commit.history.canUndo,
      canRedo: commit.history.canRedo,
      undo: commit.history.undo,
      redo: commit.history.redo,
      clear: commit.history.clear
    },
    document: {
      export: () => cloneDocument(instanceDocument.peekDocument()),
      replace: (document: DataDoc) => {
        commit.replace(cloneDocument(document))
        return cloneDocument(instanceDocument.peekDocument())
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

export type { CreateEngineOptions, Engine } from '../types'

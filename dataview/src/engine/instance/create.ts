import type { CreateEngineOptions, Engine } from '../types'
import { cloneDocument } from '@dataview/core/document'
import { resolveWriteBatch } from '@dataview/engine/command'
import { read as createRead } from '../runtime/read/read'
import { commitRuntime } from '../runtime/commit/runtime'
import { document } from './document'
import {
  createFieldsEngineApi,
  createRecordsEngineApi,
  createViewEngineApi,
  createViewsEngineApi
} from '../services'

export const createEngine = (options: CreateEngineOptions): Engine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneDocument(options.document)

  const instanceDocument = document({
    initialDocument
  })

  const read = createRead({
    getDocument: instanceDocument.peekDocument
  })

  const commit = commitRuntime({
    document: instanceDocument,
    read,
    historyCapacity
  })

  const engine = {
    read: {
      document: read.document,
      recordIds: read.recordIds,
      record: read.record,
      customFieldIds: read.customFieldIds,
      customField: read.customField,
      viewIds: read.viewIds,
      view: read.view,
      filter: read.filter,
      viewProjection: read.viewProjection
    },
    command: command => {
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
      replace: document => {
        commit.replace(document)
        return cloneDocument(instanceDocument.peekDocument())
      }
    }
  } as Engine

  engine.views = createViewsEngineApi({
    engine
  })
  engine.fields = createFieldsEngineApi({
    engine
  })
  engine.records = createRecordsEngineApi({
    engine
  })
  engine.view = viewId => createViewEngineApi({
    engine,
    viewId
  })

  return engine
}

export type { CreateEngineOptions, Engine } from '../types'

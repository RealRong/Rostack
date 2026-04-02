import type { CreateGroupEngineOptions, GroupEngine } from '../types'
import { cloneGroupDocument } from '@dataview/core/document'
import { resolveWriteBatch } from '@dataview/engine/command'
import { read as createRead } from '../runtime/read/read'
import { commitRuntime } from '../runtime/commit/runtime'
import { document } from './document'
import {
  createPropertiesEngineApi,
  createRecordsEngineApi,
  createViewEngineApi,
  createViewsEngineApi
} from '../services'

export const createGroupEngine = (options: CreateGroupEngineOptions): GroupEngine => {
  const historyCapacity = Math.max(0, options.history?.capacity ?? 100)
  const initialDocument = cloneGroupDocument(options.document)

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
      propertyIds: read.propertyIds,
      property: read.property,
      viewIds: read.viewIds,
      view: read.view,
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
      export: () => cloneGroupDocument(instanceDocument.peekDocument()),
      replace: document => {
        commit.replace(document)
        return cloneGroupDocument(instanceDocument.peekDocument())
      }
    }
  } as GroupEngine

  engine.views = createViewsEngineApi({
    engine
  })
  engine.properties = createPropertiesEngineApi({
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

export type { CreateGroupEngineOptions, GroupEngine } from '../types'

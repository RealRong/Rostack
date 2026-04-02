import type { EngineInstance } from '@whiteboard/engine'
import type { EditorRead, EditorWriteApi } from '../../types/editor'
import type { InsertPresetCatalog } from '../../types/insert'
import type { RuntimeStateController } from '../state'
import type { EditorOverlay } from '../overlay'
import { createDocumentWrite } from './document'
import { createPreviewWrite } from './preview'
import { createSessionWrite } from './session'
import { createViewWrite } from './view'

export const createEditorWrite = ({
  engine,
  read,
  runtime,
  overlay,
  insertPresetCatalog
}: {
  engine: EngineInstance
  read: EditorRead
  runtime: RuntimeStateController
  overlay: Pick<EditorOverlay, 'set'>
  insertPresetCatalog: InsertPresetCatalog
}): EditorWriteApi => {
  const preview = createPreviewWrite({
    overlay
  })
  const session = createSessionWrite({
    engine,
    runtime
  })
  const view = createViewWrite({
    runtime
  })
  const document = createDocumentWrite({
    engine,
    read,
    session,
    preview,
    insertPresetCatalog
  })

  return {
    document,
    session,
    view,
    preview,
    batch: (recipe) => recipe({
      document,
      session,
      view,
      preview
    })
  }
}

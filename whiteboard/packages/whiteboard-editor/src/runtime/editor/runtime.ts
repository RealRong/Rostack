import type { Engine } from '@whiteboard/engine'
import type { EditorRead } from '../../types/editor'
import type { NodeRegistry } from '../../types/node'
import type { RuntimeStateController } from '../state'
import type { EditorOverlay } from '../overlay'
import type { EditorViewportRuntime } from './types'
import { createDocumentRuntime } from '../document/runtime'
import type { DocumentRuntime } from '../document/types'
import { createPreviewRuntime } from '../preview/runtime'
import type { PreviewRuntime } from '../preview/types'
import { createSessionRuntime } from '../session/runtime'
import type { SessionRuntime } from '../session/types'
import { createViewRuntime } from '../view/runtime'
import type { ViewRuntime } from '../view/types'

export type EditorRuntimeChannels = {
  document: DocumentRuntime
  session: SessionRuntime
  view: ViewRuntime
  preview: PreviewRuntime
}

export type EditorRuntime = EditorRuntimeChannels & {
  batch: <T>(recipe: (tx: EditorRuntimeChannels) => T) => T
}

export const createEditorRuntime = ({
  engine,
  read,
  registry,
  runtime,
  overlay,
  viewport
}: {
  engine: Engine
  read: EditorRead
  registry: NodeRegistry
  runtime: RuntimeStateController
  overlay: Pick<EditorOverlay, 'set'>
  viewport: EditorViewportRuntime
}): EditorRuntime => {
  const preview = createPreviewRuntime({
    overlay
  })
  const session = createSessionRuntime({
    engine,
    runtime,
    read,
    registry
  })
  const view = createViewRuntime({
    runtime,
    viewport
  })
  const document = createDocumentRuntime({
    engine,
    read,
    session,
    preview
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

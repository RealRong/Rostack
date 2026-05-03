import type { DocumentFrame, EditorScene } from '@whiteboard/editor-scene'
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults'
import type { NodeTypeSupport } from '@whiteboard/editor/node'
import type { EditorStateStores } from '@whiteboard/editor/scene-ui/state'
import type { EditorStateStoreFacade } from '@whiteboard/editor/state/runtime'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'
import type { EditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { EditorWrite } from '@whiteboard/editor/write'

export type EditorActionContext = {
  document: DocumentFrame
  projection: EditorScene
  state: EditorStateStoreFacade
  stores: EditorStateStores
  viewport: EditorViewport
  tasks: EditorTaskRuntime
  write: EditorWrite
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['templates']
}

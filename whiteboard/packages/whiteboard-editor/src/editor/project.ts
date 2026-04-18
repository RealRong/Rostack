import type { Editor } from '@whiteboard/editor/types/editor'
import { projectEditorStore } from '@whiteboard/editor/editor/store'
import { projectEditorRead } from '@whiteboard/editor/editor/read'
import { projectEditorEvents } from '@whiteboard/editor/editor/events'
import type { EditorServices } from '@whiteboard/editor/editor/services'

export const projectEditor = (
  services: EditorServices
): Editor => ({
  store: projectEditorStore({
    local: services.local,
    input: services.input.state,
    viewport: services.local.viewport.read
  }),
  read: projectEditorRead(services.query),
  actions: services.actions,
  input: services.input.host,
  events: projectEditorEvents(services)
})

import type { Editor } from '@whiteboard/editor/types/editor'
import { createEdgeHoverService } from '@whiteboard/editor/input/hover/edge'
import { createEditorInputHost } from '@whiteboard/editor/editor/input'
import { projectEditorStore } from '@whiteboard/editor/editor/store'
import { projectEditorRead } from '@whiteboard/editor/editor/read'
import { projectEditorEvents } from '@whiteboard/editor/editor/events'
import { projectInteractionDeps, type EditorServices } from '@whiteboard/editor/editor/services'

export const projectEditor = (
  services: EditorServices
): Editor => {
  const interactionDeps = projectInteractionDeps(services)
  const edgeHover = createEdgeHoverService(interactionDeps, services.local.hover)

  return {
    store: projectEditorStore({
      interaction: services.local.interaction,
      local: services.local,
      viewport: services.local.viewport.read
    }),
    read: projectEditorRead(services.query),
    actions: services.actions,
    input: createEditorInputHost({
      interaction: services.local.interaction,
      edgeHover,
      query: services.query,
      local: services.local
    }),
    events: projectEditorEvents(services)
  }
}

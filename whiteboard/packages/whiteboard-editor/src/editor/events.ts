import type { EditorEvents } from '@whiteboard/editor/types/editor'
import type { EditorServices } from '@whiteboard/editor/editor/services'

export const projectEditorEvents = (
  services: EditorServices
): EditorEvents => services.lifecycle.events

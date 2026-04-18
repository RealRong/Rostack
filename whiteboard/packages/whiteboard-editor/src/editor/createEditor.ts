import type { Editor } from '@whiteboard/editor/types/editor'
import {
  createEditorServices
} from '@whiteboard/editor/editor/services'
import {
  projectEditor
} from '@whiteboard/editor/editor/project'

export const createEditor = (
  input: Parameters<typeof createEditorServices>[0]
): Editor => {
  const services = createEditorServices(input)
  return projectEditor(services)
}

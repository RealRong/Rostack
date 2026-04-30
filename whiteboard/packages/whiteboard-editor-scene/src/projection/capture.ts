import type { Revision } from '@shared/projection'
import type { Capture } from '../contracts/capture'
import type { ProjectionScene } from './query'

export const buildEditorSceneCapture = (
  read: Pick<ProjectionScene, 'capture'>,
  revision: Revision
): Capture => ({
  revision,
  documentRevision: read.capture.documentRevision(),
  graph: read.capture.graph(),
  render: read.capture.render(),
  items: read.capture.items(),
  ui: read.capture.ui()
})

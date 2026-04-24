import type {
  CanvasItemRef
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type { SceneItem } from '../contracts/editor'

const toSceneItem = (
  ref: CanvasItemRef
): SceneItem => ({
  kind: ref.kind,
  id: ref.id
}) as SceneItem

export const buildItems = (snapshot: document.Snapshot): readonly SceneItem[] => (
  snapshot.state.root.canvas.order.map(toSceneItem)
)

import type { Rect } from '@whiteboard/core/types'
import type { EditorSceneBridge } from '@whiteboard/editor/projection/bridge'
import {
  createScenePick
} from '@whiteboard/editor/scene/host/pick'
import {
  createSceneVisible
} from '@whiteboard/editor/scene/host/visible'
import type {
  EditorSceneSource as EditorSceneRuntime
} from '@whiteboard/editor/types/editor'

export type { EditorSceneRuntime }

export const createSceneSource = ({
  controller,
  visibleRect,
  readZoom
}: {
  controller: Pick<EditorSceneBridge, 'query' | 'current' | 'stores'>
  visibleRect: () => Rect
  readZoom: () => number
}): EditorSceneRuntime & {
  dispose: () => void
} => {
  const readRevision = () => controller.current().revision
  const visible = createSceneVisible({
    revision: readRevision,
    visibleRect,
    rect: controller.query.spatial.rect
  })
  const pick = createScenePick({
    readZoom,
    query: controller.query
  })

  return {
    dispose: () => {
      pick.dispose()
    },
    revision: readRevision,
    query: controller.query,
    stores: controller.stores,
    host: {
      pick,
      visible
    }
  }
}

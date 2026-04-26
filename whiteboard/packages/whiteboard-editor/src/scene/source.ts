import { store } from '@shared/core'
import type { Rect } from '@whiteboard/core/types'
import type { EditorSceneBridge } from '@whiteboard/editor/projection/bridge'
import {
  createSceneGeometry
} from '@whiteboard/editor/scene/host/geometry'
import {
  createScenePick
} from '@whiteboard/editor/scene/host/pick'
import {
  createSceneScope
} from '@whiteboard/editor/scene/host/scope'
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
  const geometry = createSceneGeometry({
    revision: readRevision,
    items: controller.stores.items,
    nodeView: controller.stores.render.node.byId,
    edgeGraph: controller.stores.graph.edge.byId
  })
  const visible = createSceneVisible({
    revision: readRevision,
    visibleRect,
    rect: controller.query.spatial.rect
  })
  const pick = createScenePick({
    readZoom,
    query: controller.query
  })
  const scope = createSceneScope({
    spatialRect: controller.query.spatial.rect,
    relatedEdges: controller.query.edge.related,
    nodeView: controller.stores.render.node.byId,
    edgeBounds: (edgeId) => controller.query.edge.get(edgeId)?.route.bounds,
    readEdges: (edgeIds) => edgeIds.flatMap((edgeId) => {
      const edge = controller.query.edge.get(edgeId)?.base.edge
      return edge ? [edge] : []
    })
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
      visible,
      geometry: {
        node: (nodeId) => store.read(controller.stores.render.node.byId, nodeId),
        edge: geometry.edge,
        order: geometry.order
      },
      scope
    }
  }
}

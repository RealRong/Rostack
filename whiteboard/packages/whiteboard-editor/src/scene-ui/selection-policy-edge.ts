import type { Edge, EdgeId } from '@whiteboard/core/types'
import { collection, entityTable } from '@shared/core'
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults'
import type { SelectionToolbarEdgeScope } from '@whiteboard/editor/scene-ui/schema'

export const readEdgeScope = ({
  edges,
  edgeIds,
  primaryEdge,
  defaults
}: {
  edges: readonly Edge[]
  edgeIds: readonly EdgeId[]
  primaryEdge?: Edge
  defaults: EditorDefaults['selection']
}): SelectionToolbarEdgeScope => ({
  edgeIds,
  edges,
  primaryEdgeId: primaryEdge?.id,
  single: edgeIds.length === 1,
  lock:
    edgeIds.length === 0
      ? 'none'
      : edges.every((edge) => edge.locked)
        ? 'all'
        : edges.some((edge) => edge.locked)
          ? 'mixed'
          : 'none',
  type: collection.uniform(edges, (entry) => entry.type),
  color: collection.uniform(edges, (entry) => entry.style?.color ?? defaults.edge.color),
  opacity: collection.uniform(edges, (entry) => entry.style?.opacity ?? 1),
  width: collection.uniform(edges, (entry) => entry.style?.width ?? defaults.edge.width),
  dash: collection.uniform(edges, (entry) => entry.style?.dash ?? defaults.edge.dash),
  start: collection.uniform(edges, (entry) => entry.style?.start),
  end: collection.uniform(edges, (entry) => entry.style?.end),
  textMode: collection.uniform(edges, (entry) => entry.textMode ?? defaults.edge.textMode),
  labelCount: entityTable.read.list(primaryEdge?.labels ?? {
    ids: [],
    byId: {}
  }).length
})

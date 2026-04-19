import { createId } from '@whiteboard/core/id'
import type {
  Edge,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgePatch,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type {
  EdgeLabelPatch,
  EdgeWrite
} from '@whiteboard/editor/write/types'
import { buildEdgeLabelTextMetricsSpec } from '@whiteboard/editor/edge/label'

const DEFAULT_EDGE_LABEL = {
  t: 0.5,
  offset: 0
} as const

const hasEdgePatchContent = (
  patch: EdgePatch
) => Object.keys(patch).length > 0

const readEdge = (
  read: EditorQuery,
  edgeId: EdgeId
) => read.edge.item.get(edgeId)?.edge

const readCommittedEdge = (
  read: Pick<EditorQuery, 'edge'>,
  edgeId: EdgeId
) => read.edge.committed.get(edgeId)?.edge

const patchEdges = (
  engine: Engine,
  updates: readonly {
    id: EdgeId
    patch: EdgePatch
  }[]
) => {
  if (!updates.length) {
    return undefined
  }

  return engine.execute({
    type: 'edge.patch',
    updates
  })
}

const patchExistingEdges = (
  read: Pick<EditorQuery, 'edge'>,
  engine: Engine,
  edgeIds: readonly EdgeId[],
  patch: EdgePatch
) => patchEdges(
  engine,
  edgeIds.flatMap((id) => readCommittedEdge(read, id)
    ? [{
        id,
        patch
      }]
    : [])
)

const patchEdgesBy = (
  edgeIds: readonly EdgeId[],
  read: EditorQuery,
  engine: Engine,
  buildPatch: (edge: Edge) => EdgePatch | undefined
) => patchEdges(
  engine,
  edgeIds.flatMap((edgeId) => {
    const edge = readEdge(read, edgeId)
    if (!edge) {
      return []
    }

    const patch = buildPatch(edge)
    if (!patch || !hasEdgePatchContent(patch)) {
      return []
    }

    return [{
      id: edgeId,
      patch
    }]
  })
)

const patchEdgeStyle = <Key extends keyof NonNullable<Edge['style']>>(
  edgeIds: readonly EdgeId[],
  read: EditorQuery,
  engine: Engine,
  key: Key,
  value: NonNullable<Edge['style']>[Key] | undefined
) => patchEdgesBy(edgeIds, read, engine, (edge) => {
  if (edge.style?.[key] === value) {
    return undefined
  }

  return {
    style: {
      ...(edge.style ?? {}),
      [key]: value
    }
  }
})

const patchEdgeType = (
  edgeIds: readonly EdgeId[],
  read: EditorQuery,
  engine: Engine,
  value: EdgeType
) => patchEdgesBy(edgeIds, read, engine, (edge) => (
  edge.type === value
    ? undefined
    : {
        type: value
      }
))

const mergeEdgeLabelPatch = (
  edge: Edge,
  labelId: string,
  patch: EdgeLabelPatch
) => {
  const labels = edge.labels ?? []
  let changed = false

  const nextLabels = labels.map((label) => {
    if (label.id !== labelId) {
      return label
    }

    changed = true

    return {
      ...label,
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.t !== undefined ? { t: patch.t } : {}),
      ...(patch.offset !== undefined ? { offset: patch.offset } : {}),
      ...(patch.style
        ? {
            style: {
              ...(label.style ?? {}),
              ...patch.style
            }
          }
        : {})
    }
  })

  return changed
    ? nextLabels
    : undefined
}

export const createEdgeWrite = ({
  engine,
  read,
  layout
}: {
  engine: Engine
  read: EditorQuery
  layout: Pick<EditorLayout, 'text'>
}): EdgeWrite => ({
  create: (input) => engine.execute({
    type: 'edge.create',
    input: {
      ...input.template,
      source: input.from,
      target: input.to
    }
  }),
  patch: (edgeIds, patch) => {
    if (!hasEdgePatchContent(patch)) {
      return undefined
    }

    return patchExistingEdges(read, engine, edgeIds, patch)
  },
  move: ({ ids, delta }) => engine.execute({
    type: 'edge.move',
    ids,
    delta
  }),
  reconnect: (edgeId, end, target) => engine.execute({
    type: 'edge.reconnect',
    edgeId,
    end,
    target
  }),
  update: (id, patch) => engine.execute({
    type: 'edge.patch',
    updates: [{
      id,
      patch
    }]
  }),
  updateMany: (updates) => engine.execute({
    type: 'edge.patch',
    updates
  }),
  delete: (ids) => engine.execute({
    type: 'edge.delete',
    ids
  }),
  route: {
    insert: (edgeId, point) => engine.execute({
      type: 'edge.route.insert',
      edgeId,
      point
    }),
    move: (edgeId, index, point) => engine.execute({
      type: 'edge.route.move',
      edgeId,
      index,
      point
    }),
    remove: (edgeId, index) => engine.execute({
      type: 'edge.route.remove',
      edgeId,
      index
    }),
    clear: (edgeId) => engine.execute({
      type: 'edge.route.clear',
      edgeId
    })
  },
  label: {
    add: (edgeId) => {
      const currentEdge = readEdge(read, edgeId)
      if (!currentEdge) {
        return undefined
      }

      const labelId = createId('edge_label')
      layout.text.ensure(buildEdgeLabelTextMetricsSpec({
        text: '',
        style: undefined
      }))
      const nextLabels = [
        ...(currentEdge.labels ?? []),
        {
          id: labelId,
          ...DEFAULT_EDGE_LABEL
        }
      ]

      const result = engine.execute({
        type: 'edge.patch',
        updates: [{
          id: edgeId,
          patch: {
            labels: nextLabels
          }
        }]
      })
      return result.ok
        ? labelId
        : undefined
    },
    patch: (edgeId, labelId, patch) => {
      const currentEdge = readEdge(read, edgeId)
      if (!currentEdge) {
        return undefined
      }

      const nextLabels = mergeEdgeLabelPatch(currentEdge, labelId, patch)
      if (!nextLabels) {
        return undefined
      }

      const nextLabel = nextLabels.find((entry) => entry.id === labelId)
      if (nextLabel) {
        layout.text.ensure(buildEdgeLabelTextMetricsSpec({
          text: nextLabel.text,
          style: nextLabel.style
        }))
      }

      return engine.execute({
        type: 'edge.patch',
        updates: [{
          id: edgeId,
          patch: {
            labels: nextLabels
          }
        }]
      })
    },
    remove: (edgeId, labelId) => {
      const currentEdge = readEdge(read, edgeId)
      if (!currentEdge?.labels?.some((label) => label.id === labelId)) {
        return undefined
      }

      const nextLabels = currentEdge.labels.filter((label) => label.id !== labelId)
      return engine.execute({
        type: 'edge.patch',
        updates: [{
          id: edgeId,
          patch: {
            labels: nextLabels.length > 0 ? nextLabels : []
          }
        }]
      })
    }
  },
  style: {
    color: (edgeIds, value) => patchEdgeStyle(edgeIds, read, engine, 'color', value),
    opacity: (edgeIds, value) => patchEdgeStyle(edgeIds, read, engine, 'opacity', value),
    width: (edgeIds, value) => patchEdgeStyle(edgeIds, read, engine, 'width', value),
    dash: (edgeIds, value) => patchEdgeStyle(edgeIds, read, engine, 'dash', value),
    start: (edgeIds, value) => patchEdgeStyle(edgeIds, read, engine, 'start', value),
    end: (edgeIds, value) => patchEdgeStyle(edgeIds, read, engine, 'end', value),
    swapMarkers: (edgeIds) => patchEdgesBy(edgeIds, read, engine, (edge) => {
      const start = edge.style?.start
      const end = edge.style?.end
      if (start === end) {
        return undefined
      }

      return {
        style: {
          ...(edge.style ?? {}),
          start: end,
          end: start
        }
      }
    })
  },
  type: {
    set: (edgeIds, value) => patchEdgeType(edgeIds, read, engine, value)
  },
  lock: {
    set: (edgeIds, locked) => patchExistingEdges(read, engine, edgeIds, {
      locked
    }),
    toggle: (edgeIds) => {
      const shouldLock = edgeIds.some((id) => !readCommittedEdge(read, id)?.locked)
      return patchExistingEdges(read, engine, edgeIds, {
        locked: shouldLock
      })
    }
  },
  textMode: {
    set: (edgeIds, value) => patchEdgesBy(edgeIds, read, engine, (edge) => (
      edge.textMode === value
        ? undefined
        : {
            textMode: value
          }
    ))
  }
})

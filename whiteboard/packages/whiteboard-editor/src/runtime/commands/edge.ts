import { createId } from '@whiteboard/core/utils'
import type { Edge, EdgeId } from '@whiteboard/core/types'
import type {
  Editor,
  EditorDocumentWrite,
  EditorEdgeLabelPatch,
  EditorEdgesActions,
  EditorEdgesPatch,
  EditorEdgesStylePatch,
  EditorRead,
  EditorSessionWrite
} from '../../types/editor'

const DEFAULT_EDGE_LABEL = {
  t: 0.5,
  offset: 0
} as const

const mergeEdgePatch = (
  patch: EditorEdgesPatch
) => ({
  ...(patch.type !== undefined ? { type: patch.type } : {}),
  ...(patch.textMode !== undefined ? { textMode: patch.textMode } : {})
})

const mergeEdgeStylePatch = (
  edge: Edge,
  patch: EditorEdgesStylePatch
) => ({
  style: {
    ...(edge.style ?? {}),
    ...patch
  }
})

const mergeEdgeLabelPatch = (
  edge: Edge,
  labelId: string,
  patch: EditorEdgeLabelPatch
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

const readEdge = (
  read: EditorRead,
  edgeId: EdgeId
) => read.edge.item.get(edgeId)?.edge

export const createEdgesActions = ({
  read,
  edit,
  session,
  document
}: {
  read: EditorRead
  edit: Editor['state']['edit']
  session: Pick<EditorSessionWrite, 'edit' | 'selection'>
  document: Pick<EditorDocumentWrite, 'edge'>
}): EditorEdgesActions => ({
  create: document.edge.create,
  move: document.edge.move,
  reconnect: document.edge.reconnect,
  delete: document.edge.delete,
  route: document.edge.route,
  set: (edgeIds, patch) => {
    const updates = edgeIds.flatMap((edgeId) => {
      const edge = readEdge(read, edgeId)
      if (!edge) {
        return []
      }

      const nextPatch = mergeEdgePatch(patch)
      return Object.keys(nextPatch).length > 0
        ? [{
            id: edgeId,
            patch: nextPatch
          }]
        : []
    })

    if (updates.length === 0) {
      return undefined
    }

    return document.edge.updateMany(updates)
  },
  style: {
    set: (edgeIds, patch) => {
      const updates = edgeIds.flatMap((edgeId) => {
        const edge = readEdge(read, edgeId)
        if (!edge) {
          return []
        }

        return [{
          id: edgeId,
          patch: mergeEdgeStylePatch(edge, patch)
        }]
      })

      if (updates.length === 0) {
        return undefined
      }

      return document.edge.updateMany(updates)
    },
    swapMarkers: (edgeId) => {
      const edge = readEdge(read, edgeId)
      if (!edge) {
        return undefined
      }

      return document.edge.update(edgeId, {
        style: {
          ...(edge.style ?? {}),
          start: edge.style?.end ?? 'none',
          end: edge.style?.start ?? 'none'
        }
      })
    }
  },
  labels: {
    add: (edgeId) => {
      const edge = readEdge(read, edgeId)
      if (!edge) {
        return undefined
      }

      const currentEdit = edit.get()
      if (
        currentEdit
        && currentEdit.kind === 'edge-label'
        && currentEdit.edgeId === edgeId
      ) {
        return undefined
      }

      const labelId = createId('edge_label')
      const nextLabels = [
        ...(edge.labels ?? []),
        {
          id: labelId,
          ...DEFAULT_EDGE_LABEL
        }
      ]

      document.edge.update(edgeId, {
        labels: nextLabels
      })
      session.selection.replace({
        edgeIds: [edgeId]
      })
      session.edit.startEdgeLabel(edgeId, labelId)
      return labelId
    },
    update: (edgeId, labelId, patch) => {
      const edge = readEdge(read, edgeId)
      if (!edge) {
        return undefined
      }

      const nextLabels = mergeEdgeLabelPatch(edge, labelId, patch)
      if (!nextLabels) {
        return undefined
      }

      return document.edge.update(edgeId, {
        labels: nextLabels
      })
    },
    remove: (edgeId, labelId) => {
      const edge = readEdge(read, edgeId)
      if (!edge?.labels?.some((label) => label.id === labelId)) {
        return undefined
      }

      const nextLabels = edge.labels.filter((label) => label.id !== labelId)
      const currentEdit = edit.get()
      if (
        currentEdit
        && currentEdit.kind === 'edge-label'
        && currentEdit.edgeId === edgeId
        && currentEdit.labelId === labelId
      ) {
        session.edit.clear()
      }

      return document.edge.update(edgeId, {
        labels: nextLabels.length > 0 ? nextLabels : []
      })
    }
  }
})

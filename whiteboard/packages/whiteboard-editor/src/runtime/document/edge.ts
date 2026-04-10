import { createId } from '@whiteboard/core/id'
import type { Edge, EdgeId } from '@whiteboard/core/types'
import type {
  Editor,
  EditorEdgeLabelPatch,
  EditorRead
} from '../../types/editor'
import type { DocumentRuntime } from './types'
import type { SessionRuntime } from '../session/types'

const DEFAULT_EDGE_LABEL = {
  t: 0.5,
  offset: 0
} as const

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

export const createEdgeLabelActions = ({
  read,
  edit,
  session,
  document
}: {
  read: EditorRead
  edit: Editor['state']['edit']
  session: Pick<SessionRuntime, 'edit' | 'selection'>
  document: Pick<DocumentRuntime, 'edge'>
}): Editor['document']['edges']['labels'] => ({
  add: (edgeId: EdgeId) => {
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
  patch: (
    edgeId: EdgeId,
    labelId: string,
    patch: EditorEdgeLabelPatch
  ) => {
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
  remove: (edgeId: EdgeId, labelId: string) => {
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
})

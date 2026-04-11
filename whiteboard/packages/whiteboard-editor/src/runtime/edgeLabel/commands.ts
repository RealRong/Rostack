import { createId } from '@whiteboard/core/id'
import type { Edge, EdgeId } from '@whiteboard/core/types'
import type {
  EditorRead,
  EditorStore
} from '../../types/editor'
import type {
  EdgeLabelActions,
  EdgeLabelPatch
} from '../../types/commands'
import type { SessionCommands } from '../session/types'
import type { EdgeCommands } from '../edge/commands'

const DEFAULT_EDGE_LABEL = {
  t: 0.5,
  offset: 0
} as const

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

const readEdge = (
  read: EditorRead,
  edgeId: EdgeId
) => read.edge.item.get(edgeId)?.edge

export const createEdgeLabelCommands = ({
  read,
  edit,
  session,
  edge
}: {
  read: EditorRead
  edit: EditorStore['edit']
  session: Pick<SessionCommands, 'edit' | 'selection'>
  edge: Pick<EdgeCommands, 'update'>
}): EdgeLabelActions => ({
  add: (edgeId: EdgeId) => {
    const currentEdge = readEdge(read, edgeId)
    if (!currentEdge) {
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
      ...(currentEdge.labels ?? []),
      {
        id: labelId,
        ...DEFAULT_EDGE_LABEL
      }
    ]

    edge.update(edgeId, {
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
    patch: EdgeLabelPatch
  ) => {
    const currentEdge = readEdge(read, edgeId)
    if (!currentEdge) {
      return undefined
    }

    const nextLabels = mergeEdgeLabelPatch(currentEdge, labelId, patch)
    if (!nextLabels) {
      return undefined
    }

    return edge.update(edgeId, {
      labels: nextLabels
    })
  },
  setText: (edgeId: EdgeId, labelId: string, text: string) => {
    const currentEdge = readEdge(read, edgeId)
    if (!currentEdge) {
      return undefined
    }

    const nextLabels = mergeEdgeLabelPatch(currentEdge, labelId, {
      text
    })
    if (!nextLabels) {
      return undefined
    }

    return edge.update(edgeId, {
      labels: nextLabels
    })
  },
  remove: (edgeId: EdgeId, labelId: string) => {
    const currentEdge = readEdge(read, edgeId)
    if (!currentEdge?.labels?.some((label) => label.id === labelId)) {
      return undefined
    }

    const nextLabels = currentEdge.labels.filter((label) => label.id !== labelId)
    const currentEdit = edit.get()
    if (
      currentEdit
      && currentEdit.kind === 'edge-label'
      && currentEdit.edgeId === edgeId
      && currentEdit.labelId === labelId
    ) {
      session.edit.clear()
    }

    return edge.update(edgeId, {
      labels: nextLabels.length > 0 ? nextLabels : []
    })
  }
})

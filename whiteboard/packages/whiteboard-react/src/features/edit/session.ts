import type { EdgeId, NodeId } from '@whiteboard/core/types'
import type { EditField, EditSession } from '@whiteboard/editor'

type NodeEditSession = Extract<NonNullable<EditSession>, { kind: 'node' }>
type EdgeLabelEditSession = Extract<NonNullable<EditSession>, { kind: 'edge-label' }>

export const matchNodeEdit = (
  edit: EditSession,
  nodeId: NodeId,
  field: EditField
): NodeEditSession | null => (
  edit?.kind === 'node'
  && edit.nodeId === nodeId
  && edit.field === field
    ? edit
    : null
)

export const matchEdgeLabelEdit = (
  edit: EditSession,
  edgeId: EdgeId,
  labelId: string
): EdgeLabelEditSession | null => (
  edit?.kind === 'edge-label'
  && edit.edgeId === edgeId
  && edit.labelId === labelId
    ? edit
    : null
)

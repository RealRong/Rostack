import {
  read as readValue
} from '@shared/core'
import {
  applyEdgePatch,
  resolveEdgeView,
  type EdgeView as CoreEdgeView
} from '@whiteboard/core/edge'
import type {
  EdgeItem
} from '@whiteboard/engine'
import type {
  EdgeFeedbackProjection
} from '../../local/feedback/types'
import type { NodeCanvasSnapshot, NodePresentationRead } from '../node/read'
import type {
  EditSession
} from '../../local/session/edit'

const applyEdgeEditSession = (
  edge: EdgeItem['edge'],
  session: EditSession
): EdgeItem['edge'] => {
  if (
    !session
    || session.kind !== 'edge-label'
    || session.edgeId !== edge.id
  ) {
    return edge
  }

  const nextLabels = edge.labels?.map((label) => (
    label.id !== session.labelId
      ? label
      : {
          ...label,
          text: session.draft.text
        }
  ))

  return nextLabels
    ? {
        ...edge,
        labels: nextLabels
      }
    : edge
}

export const projectEdgeItem = (
  entry: EdgeItem,
  feedback: EdgeFeedbackProjection,
  session: EditSession
): EdgeItem => {
  const nextEdge = applyEdgeEditSession(
    applyEdgePatch(entry.edge, feedback.patch),
    session
  )

  return nextEdge === entry.edge
    ? entry
    : {
        ...entry,
        edge: nextEdge
      }
}

const readResolvedNodeSnapshot = (
  readNode: Pick<NodePresentationRead, 'canvas'>,
  edgeEnd: EdgeItem['edge']['source'] | EdgeItem['edge']['target']
): NodeCanvasSnapshot | undefined => edgeEnd.kind === 'node'
  ? readValue(readNode.canvas, edgeEnd.nodeId)
  : undefined

export const readProjectedEdgeView = (
  node: Pick<NodePresentationRead, 'canvas'>,
  entry: EdgeItem
): CoreEdgeView | undefined => {
  const source = readResolvedNodeSnapshot(node, entry.edge.source)
  const target = readResolvedNodeSnapshot(node, entry.edge.target)

  if (
    (entry.edge.source.kind === 'node' && !source)
    || (entry.edge.target.kind === 'node' && !target)
  ) {
    return undefined
  }

  try {
    return resolveEdgeView({
      edge: entry.edge,
      source,
      target
    })
  } catch {
    return undefined
  }
}

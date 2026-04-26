import {
  resolveCommittedEdgeView
} from '@whiteboard/core/edge'
import {
  resolveCommittedNodeView
} from '@whiteboard/core/node'
import type {
  EdgeId,
  NodeId,
  Size
} from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

const removeAbsentKeys = <TId extends string, TValue>(
  map: Map<TId, TValue>,
  present: ReadonlySet<TId>
) => {
  for (const id of map.keys()) {
    if (!present.has(id)) {
      map.delete(id)
    }
  }
}

export const patchDocumentState = (input: {
  current: Input
  working: WorkingState
  nodeSize: Size
  reset?: boolean
}) => {
  const snapshot = input.current.document.snapshot.document
  input.working.document.snapshot = snapshot
  input.working.document.background = snapshot.background

  const touchedNodeIds = input.reset
    ? Object.keys(snapshot.nodes) as readonly NodeId[]
    : [
        ...input.current.document.delta.nodes.added,
        ...input.current.document.delta.nodes.updated,
        ...input.current.document.delta.nodes.removed
      ]
  const touchedNodeIdSet = new Set(touchedNodeIds)
  touchedNodeIds.forEach((nodeId) => {
    const node = snapshot.nodes[nodeId]
    if (!node) {
      input.working.document.nodes.delete(nodeId)
      return
    }

    input.working.document.nodes.set(nodeId, resolveCommittedNodeView({
      node,
      nodeSize: input.nodeSize
    }))
  })

  const touchedEdgeIds = new Set<EdgeId>(
    input.reset
      ? Object.keys(snapshot.edges) as readonly EdgeId[]
      : [
          ...input.current.document.delta.edges.added,
          ...input.current.document.delta.edges.updated,
          ...input.current.document.delta.edges.removed
        ]
  )
  if (!input.reset && touchedNodeIdSet.size > 0) {
    ;(Object.keys(snapshot.edges) as readonly EdgeId[]).forEach((edgeId) => {
      const edge = snapshot.edges[edgeId]
      if (
        (edge?.source.kind === 'node' && touchedNodeIdSet.has(edge.source.nodeId))
        || (edge?.target.kind === 'node' && touchedNodeIdSet.has(edge.target.nodeId))
      ) {
        touchedEdgeIds.add(edgeId)
      }
    })
  }
  touchedEdgeIds.forEach((edgeId) => {
    const edge = snapshot.edges[edgeId]
    if (!edge) {
      input.working.document.edges.delete(edgeId)
      return
    }

    const view = resolveCommittedEdgeView({
      edge,
      document: snapshot,
      nodeSize: input.nodeSize
    })
    if (!view) {
      input.working.document.edges.delete(edgeId)
      return
    }

    input.working.document.edges.set(edgeId, view)
  })

  if (input.reset) {
    removeAbsentKeys(
      input.working.document.nodes,
      new Set(Object.keys(snapshot.nodes) as readonly NodeId[])
    )
    removeAbsentKeys(
      input.working.document.edges,
      new Set(Object.keys(snapshot.edges) as readonly EdgeId[])
    )
  }
}

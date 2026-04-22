import { document as documentApi } from '@whiteboard/core/document'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  GroupId,
  MindmapId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type {
  EdgeNodes,
  OwnerNodes,
  OwnerRef,
  Relations
} from '../contracts/document'

const toNodeOwner = (
  node: Node
): OwnerRef | undefined => {
  if (node.owner?.kind === 'mindmap') {
    return {
      kind: 'mindmap',
      id: node.owner.id
    }
  }

  if (node.groupId) {
    return {
      kind: 'group',
      id: node.groupId
    }
  }

  return undefined
}

const buildNodeOwner = (
  document: Document
): ReadonlyMap<NodeId, OwnerRef | undefined> => {
  const entries = Object.entries(document.nodes) as readonly (readonly [NodeId, Node])[]
  return new Map(entries.map(([nodeId, node]) => [nodeId, toNodeOwner(node)] as const))
}

const buildOwnerNodes = (
  document: Document
): OwnerNodes => {
  const mindmaps = new Map<MindmapId, readonly NodeId[]>()
  const groups = new Map<GroupId, readonly NodeId[]>()

  const mindmapEntries = Object.entries(document.mindmaps) as readonly (readonly [MindmapId, Document['mindmaps'][string]])[]
  mindmapEntries.forEach(([mindmapId, record]) => {
    mindmaps.set(mindmapId, Object.keys(record.members) as readonly NodeId[])
  })

  const groupEntries = Object.entries(document.groups) as readonly (readonly [GroupId, Document['groups'][string]])[]
  groupEntries.forEach(([groupId]) => {
    groups.set(groupId, documentApi.list.groupNodeIds(document, groupId) as readonly NodeId[])
  })

  return {
    mindmaps,
    groups
  }
}

const buildParentNode = (
  document: Document
): ReadonlyMap<NodeId, NodeId | undefined> => {
  const map = new Map<NodeId, NodeId | undefined>()

  ;(Object.entries(document.nodes) as readonly (readonly [NodeId, Node])[]).forEach(([nodeId]) => {
    map.set(nodeId, undefined)
  })

  ;(Object.entries(document.mindmaps) as readonly (readonly [MindmapId, Document['mindmaps'][string]])[]).forEach(([, record]) => {
    ;(Object.entries(record.members) as readonly (readonly [NodeId, Document['mindmaps'][string]['members'][string]])[]).forEach(([nodeId, member]) => {
      map.set(nodeId, member.parentId)
    })
  })

  return map
}

const buildChildNodes = (
  document: Document
): ReadonlyMap<NodeId, readonly NodeId[]> => {
  const map = new Map<NodeId, readonly NodeId[]>()

  ;(Object.entries(document.nodes) as readonly (readonly [NodeId, Node])[]).forEach(([nodeId]) => {
    map.set(nodeId, [])
  })

  ;(Object.entries(document.mindmaps) as readonly (readonly [MindmapId, Document['mindmaps'][string]])[]).forEach(([, record]) => {
    ;(Object.entries(record.children) as readonly (readonly [NodeId, readonly NodeId[]])[]).forEach(([nodeId, children]) => {
      map.set(nodeId, [...children])
    })
  })

  return map
}

const buildEdgeNodes = (
  document: Document
): ReadonlyMap<EdgeId, EdgeNodes> => {
  const entries = Object.entries(document.edges) as readonly (readonly [EdgeId, Edge])[]
  return new Map(entries.map(([edgeId, edge]) => [
    edgeId,
    {
      ...(edge.source.kind === 'node'
        ? { source: edge.source.nodeId }
        : {}),
      ...(edge.target.kind === 'node'
        ? { target: edge.target.nodeId }
        : {})
    } satisfies EdgeNodes
  ] as const))
}

const buildGroupItems = (
  document: Document
): ReadonlyMap<GroupId, readonly CanvasItemRef[]> => {
  const map = new Map<GroupId, readonly CanvasItemRef[]>()
  ;(Object.keys(document.groups) as readonly GroupId[]).forEach((groupId) => {
    map.set(groupId, documentApi.list.groupCanvasRefs(document, groupId) as readonly CanvasItemRef[])
  })
  return map
}

export const buildRelations = (
  document: Document
): Relations => ({
  nodeOwner: buildNodeOwner(document),
  ownerNodes: buildOwnerNodes(document),
  parentNode: buildParentNode(document),
  childNodes: buildChildNodes(document),
  edgeNodes: buildEdgeNodes(document),
  groupItems: buildGroupItems(document)
})

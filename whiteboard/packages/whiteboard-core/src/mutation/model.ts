import {
  clone
} from '@whiteboard/core/mutation/common'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeRoutePoint,
  Group,
  GroupId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type {
  MindmapId,
  MindmapRecord
} from '@whiteboard/core/mindmap/types'
import {
  defineMutationModel,
  mapFamily,
  ordered,
  record,
  singleton,
  tree,
  value,
} from '@shared/mutation'
import {
  applyEdgeLabelPatch,
  canvasRefKey,
  createMindmapTreeSnapshot,
  diffEdgeLabelPatch,
  getLabels,
  getManualRoutePoints,
  type WhiteboardMindmapTreeValue,
  writeEdgeLabels,
  writeEdgeRoute,
  writeMindmapTreeSnapshot,
} from './support'

export const whiteboardMutationModel = defineMutationModel<Document>()({
  document: singleton<Document, Document>()({
    access: {
      read: (document) => document,
      write: (_document, next) => next as Document,
    },
    members: {
      id: value<Document['id']>(),
      name: value<Document['name']>(),
      background: value<Document['background']>(),
      order: record<readonly CanvasItemRef[]>(),
    },
    changes: ({ value, record }) => ({
      value: [
        value('id'),
        value('name'),
      ],
      background: [value('background')],
      order: [record('order').self()],
    }),
    ordered: {
      order: ordered<CanvasItemRef>()({
        read: (document: Document) => document.order,
        write: (document: Document, items: readonly CanvasItemRef[]) => ({
          ...document,
          order: items.map((item) => clone(item)!),
        }),
        identify: canvasRefKey,
        clone: (item: CanvasItemRef) => clone(item)!,
        emits: 'order',
      }),
    },
  }),

  node: mapFamily<Document, NodeId, Node>()({
    access: {
      read: (document) => document.nodes,
      write: (document, next) => ({
        ...document,
        nodes: next as Document['nodes'],
      }),
    },
    members: {
      type: value<Node['type']>(),
      position: value<Node['position']>(),
      size: value<Node['size']>(),
      rotation: value<Node['rotation']>(),
      groupId: value<Node['groupId']>(),
      owner: value<Node['owner']>(),
      locked: value<Node['locked']>(),
      data: record<Node['data']>(),
      style: record<Node['style']>(),
    },
    changes: ({ value, record }) => ({
      geometry: [
        value('position'),
        value('size'),
        value('rotation'),
      ],
      owner: [
        value('groupId'),
        value('owner'),
      ],
      content: [
        value('type'),
        value('locked'),
        record('data').deep(),
        record('style').deep(),
      ],
    }),
  }),

  edge: mapFamily<Document, EdgeId, Edge>()({
    access: {
      read: (document) => document.edges,
      write: (document, next) => ({
        ...document,
        edges: next as Document['edges'],
      }),
    },
    members: {
      source: value<Edge['source']>(),
      target: value<Edge['target']>(),
      type: value<Edge['type']>(),
      locked: value<Edge['locked']>(),
      groupId: value<Edge['groupId']>(),
      textMode: value<Edge['textMode']>(),
      route: record<Edge['route']>(),
      style: record<Edge['style']>(),
      labels: record<Edge['labels']>(),
      data: record<Edge['data']>(),
    },
    changes: ({ value, record }) => ({
      endpoints: [
        value('source'),
        value('target'),
        value('type'),
        value('locked'),
        value('groupId'),
        value('textMode'),
      ],
      route: [record('route').deep()],
      style: [record('style').deep()],
      labels: [record('labels').deep()],
      data: [record('data').deep()],
    }),
    ordered: {
      labels: ordered<EdgeLabel>()({
        read: (document, edgeId) => getLabels(document.edges[edgeId]!),
        write: (document, edgeId, items) => writeEdgeLabels(document, edgeId as EdgeId, items),
        identify: (label) => label.id,
        clone: (label) => clone(label)!,
        patch: applyEdgeLabelPatch,
        diff: diffEdgeLabelPatch,
        emits: 'labels',
      }),
      route: ordered<EdgeRoutePoint>()({
        read: (document, edgeId) => getManualRoutePoints(document.edges[edgeId]!),
        write: (document, edgeId, items) => writeEdgeRoute(document, edgeId as EdgeId, items),
        identify: (point) => point.id,
        clone: (point) => clone(point)!,
        emits: 'route',
      }),
    },
  }),

  mindmap: mapFamily<Document, MindmapId, MindmapRecord>()({
    access: {
      read: (document) => document.mindmaps,
      write: (document, next) => ({
        ...document,
        mindmaps: next as Document['mindmaps'],
      }),
    },
    members: {
      root: value<MindmapRecord['root']>(),
      members: record<MindmapRecord['members']>(),
      children: record<MindmapRecord['children']>(),
      layout: record<MindmapRecord['layout']>(),
    },
    changes: ({ value, record }) => ({
      structure: [
        value('root'),
        record('members').deep(),
        record('children').deep(),
      ],
      layout: [record('layout').deep()],
    }),
    tree: {
      structure: tree<WhiteboardMindmapTreeValue>()({
        read: (document, mindmapId) => createMindmapTreeSnapshot(document.mindmaps[mindmapId]!),
        write: (document, mindmapId, snapshot) => writeMindmapTreeSnapshot(
          document,
          mindmapId as MindmapId,
          snapshot
        ),
        clone: (value) => clone(value)!,
        emits: 'structure',
      }),
    },
  }),

  group: mapFamily<Document, GroupId, Group>()({
    access: {
      read: (document) => document.groups,
      write: (document, next) => ({
        ...document,
        groups: next as Document['groups'],
      }),
    },
    members: {
      locked: value<Group['locked']>(),
      name: value<Group['name']>(),
    },
    changes: ({ value }) => ({
      value: [
        value('locked'),
        value('name'),
      ],
    }),
  }),
})

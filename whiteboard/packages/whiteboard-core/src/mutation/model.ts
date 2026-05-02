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
  defineMutationSchema,
  collection,
  sequence,
  object,
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

export const whiteboardMutationSchema = defineMutationSchema<Document>()({
  document: singleton<Document, Document>()({
    access: {
      read: (document) => document,
      write: (_document, next) => next as Document,
    },
    members: {
      id: value<Document['id']>(),
      name: value<Document['name']>(),
      background: value<Document['background']>(),
      order: object<readonly CanvasItemRef[]>(),
    },
    changes: ({ value, object }) => ({
      value: [
        value('id'),
        value('name'),
      ],
      background: [value('background')],
      order: [object('order').self()],
    }),
    sequence: {
      order: sequence<CanvasItemRef>()({
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

  node: collection<Document, NodeId, Node>()({
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
      data: object<Node['data']>(),
      style: object<Node['style']>(),
    },
    changes: ({ value, object }) => ({
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
        object('data').deep(),
        object('style').deep(),
      ],
    }),
  }),

  edge: collection<Document, EdgeId, Edge>()({
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
      route: object<Edge['route']>(),
      style: object<Edge['style']>(),
      labels: object<Edge['labels']>(),
      data: object<Edge['data']>(),
    },
    changes: ({ value, object }) => ({
      endpoints: [
        value('source'),
        value('target'),
        value('type'),
        value('locked'),
        value('groupId'),
        value('textMode'),
      ],
      route: [object('route').deep()],
      style: [object('style').deep()],
      labels: [object('labels').deep()],
      data: [object('data').deep()],
    }),
    sequence: {
      labels: sequence<EdgeLabel>()({
        read: (document, edgeId) => getLabels(document.edges[edgeId]!),
        write: (document, edgeId, items) => writeEdgeLabels(document, edgeId as EdgeId, items),
        identify: (label) => label.id,
        clone: (label) => clone(label)!,
        patch: applyEdgeLabelPatch,
        diff: diffEdgeLabelPatch,
        emits: 'labels',
      }),
      route: sequence<EdgeRoutePoint>()({
        read: (document, edgeId) => getManualRoutePoints(document.edges[edgeId]!),
        write: (document, edgeId, items) => writeEdgeRoute(document, edgeId as EdgeId, items),
        identify: (point) => point.id,
        clone: (point) => clone(point)!,
        emits: 'route',
      }),
    },
  }),

  mindmap: collection<Document, MindmapId, MindmapRecord>()({
    access: {
      read: (document) => document.mindmaps,
      write: (document, next) => ({
        ...document,
        mindmaps: next as Document['mindmaps'],
      }),
    },
    members: {
      root: value<MindmapRecord['root']>(),
      members: object<MindmapRecord['members']>(),
      children: object<MindmapRecord['children']>(),
      layout: object<MindmapRecord['layout']>(),
    },
    changes: ({ value, object }) => ({
      structure: [
        value('root'),
        object('members').deep(),
        object('children').deep(),
      ],
      layout: [object('layout').deep()],
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

  group: collection<Document, GroupId, Group>()({
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
